import re
import math
from collections import Counter

def tokenize_text(text: str) -> list[str]:
    """Extracts lowercase alpha-numeric tokens and splits hyphenated/dotted sub-parts."""
    if not text:
        return []
    text_clean = re.sub(r'[^\w\s\-\.\/]', ' ', text.lower())
    raw_tokens = re.findall(r'[a-z0-9_\-\.\/]+', text_clean)
    tokens = []
    for t in raw_tokens:
        t_clean = t.strip('.-_/')
        if len(t_clean) >= 2:
            tokens.append(t_clean)
            subparts = re.split(r'[\-_/.]+', t_clean)
            if len(subparts) > 1:
                for sp in subparts:
                    if len(sp) >= 2:
                        tokens.append(sp)
    return tokens

class BM25Okapi:
    """Zero-dependency, fast in-memory BM25Okapi lexical retrieval index."""
    def __init__(self, corpus: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus_size = len(corpus)
        self.avgdl = (sum(len(doc) for doc in corpus) / self.corpus_size) if self.corpus_size > 0 else 1.0
        self.doc_freqs = []
        self.idf = {}
        self.doc_len = [len(doc) for doc in corpus]

        nd = {}
        for doc in corpus:
            frequencies = Counter(doc)
            self.doc_freqs.append(frequencies)
            for word in frequencies:
                nd[word] = nd.get(word, 0) + 1

        for word, freq in nd.items():
            self.idf[word] = math.log((self.corpus_size - freq + 0.5) / (freq + 0.5) + 1.0)

    def get_scores(self, query: list[str]) -> list[float]:
        scores = [0.0] * self.corpus_size
        if not self.corpus_size or not query:
            return scores
        for q in query:
            if q not in self.idf:
                continue
            idf_val = self.idf[q]
            for i, doc_freq in enumerate(self.doc_freqs):
                if q in doc_freq:
                    freq = doc_freq[q]
                    l = self.doc_len[i]
                    denom = freq + self.k1 * (1 - self.b + self.b * (l / self.avgdl))
                    scores[i] += idf_val * (freq * (self.k1 + 1)) / (denom if denom > 0 else 1.0)
        return scores
