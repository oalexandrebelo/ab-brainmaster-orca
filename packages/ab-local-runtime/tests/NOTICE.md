# Qwen protocol fixture

`qwen3-template.txt` is the unmodified public Ollama Qwen3 chat-template blob at SHA-256 `ae370d884f108d16e7cc8fd5259ebc5773a0afa6e078b11f4ed7e39a27e0dfc4`, distributed with the pinned `qwen3:0.6b` manifest `7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435`.

Source: <https://registry.ollama.ai/v2/library/qwen3/blobs/sha256:ae370d884f108d16e7cc8fd5259ebc5773a0afa6e078b11f4ed7e39a27e0dfc4>. The accompanying Apache-2.0 model license is retained verbatim in `QWEN-LICENSE.txt` (source blob SHA-256 `d18a5cc71b84bc4af394a31116bd3932b42241de70c77d2b76d69a314ec8aa12`).

The fixture lets protocol tests exercise the production template-identity guard. It contains no weights and does not represent a real inference result.
