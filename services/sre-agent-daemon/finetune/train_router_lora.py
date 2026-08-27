"""
Chapters 5-8: QLoRA fine-tune of a small open-weights model on router_train.jsonl
(produced by export_router_training_data.py) to replace the hosted-LLM call in
ControlTowerAIRouter.classify_ticket() (daemon/orchestrator/router.py).

Requires: torch (CUDA build), transformers, peft, bitsandbytes, trl, datasets
    pip install torch --index-url https://download.pytorch.org/whl/cu121
    pip install transformers peft bitsandbytes trl datasets accelerate

Usage:
    python train_router_lora.py
"""
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

# Small enough to QLoRA-train on a single consumer GPU. Swap for a 7-8B
# instruct model (e.g. meta-llama/Meta-Llama-3-8B-Instruct) on hardware with
# more VRAM headroom -- see the sizing note in the README this script sits
# next to.
BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
OUTPUT_DIR = "router-lora-adapter"

def main():
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        quantization_config=bnb_config,
        device_map="auto",
    )
    model = prepare_model_for_kbit_training(model)

    # Rank 16 adapters on the attention projections only -- department/priority
    # classification is a narrow task; there's no need to touch every linear
    # layer the way a general-purpose instruction fine-tune would.
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    dataset = load_dataset(
        "json",
        data_files={"train": "router_train.jsonl", "validation": "router_val.jsonl"},
    )

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        gradient_checkpointing=True,
        num_train_epochs=3,
        learning_rate=2e-4,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        bf16=True,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset["validation"],
        tokenizer=tokenizer,
    )

    trainer.train()
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"Adapter saved to {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
