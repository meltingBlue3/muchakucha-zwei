-- Voice transcription configurations (Qwen-ASR) share the model configuration table; the protocol fixes their use.
ALTER TABLE "assistant_providers" DROP CONSTRAINT "assistant_providers_protocol_check";
ALTER TABLE "assistant_providers" ADD CONSTRAINT "assistant_providers_protocol_check" CHECK ("protocol" IN ('openai-compatible', 'anthropic', 'qwen-asr'));
