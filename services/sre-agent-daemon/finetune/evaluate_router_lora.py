"""
Chapter 8: grades the fine-tuned adapter against the held-out router_val.jsonl
split that training never saw -- accuracy per field, plus a confusion breakdown
per department so a systematically weak class (e.g. the smaller Desktop
Support / SecOps slices) shows up instead of hiding inside an averaged score.
"""
import json
import re
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
ADAPTER_DIR = "router-lora-adapter"

def load_model():
    tokenizer = AutoTokenizer.from_pretrained(ADAPTER_DIR)
    base = AutoModelForCausalLM.from_pretrained(BASE_MODEL, device_map="auto", torch_dtype=torch.bfloat16)
    model = PeftModel.from_pretrained(base, ADAPTER_DIR)
    model.eval()
    return model, tokenizer

def predict(model, tokenizer, messages):
    prompt = tokenizer.apply_chat_template(messages[:2], tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=60, do_sample=False)
    text = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    match = re.search(r'\{.*\}', text, re.DOTALL)
    return json.loads(match.group(0)) if match else {}

def main():
    model, tokenizer = load_model()
    examples = [json.loads(l) for l in open("router_val.jsonl", encoding="utf-8")]

    dept_correct, prio_correct, both_correct = 0, 0, 0
    per_dept = {}

    for ex in examples:
        gold = json.loads(ex["messages"][2]["content"])
        try:
            pred = predict(model, tokenizer, ex["messages"])
        except Exception:
            pred = {}

        d_ok = pred.get("recommendedDepartment") == gold["recommendedDepartment"]
        p_ok = pred.get("priority") == gold["priority"]
        dept_correct += d_ok
        prio_correct += p_ok
        both_correct += d_ok and p_ok

        bucket = per_dept.setdefault(gold["recommendedDepartment"], [0, 0])
        bucket[1] += 1
        bucket[0] += d_ok

    n = len(examples)
    print(f"Held-out examples: {n}")
    print(f"Department accuracy: {dept_correct/n:.1%}")
    print(f"Priority accuracy:   {prio_correct/n:.1%}")
    print(f"Both correct:        {both_correct/n:.1%}")
    print("\nPer-department accuracy:")
    for dept, (correct, total) in sorted(per_dept.items()):
        print(f"  {dept:<16} {correct}/{total} ({correct/total:.1%})")

if __name__ == "__main__":
    main()
