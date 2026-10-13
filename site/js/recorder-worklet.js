// Runs on the browser's audio thread. It receives the microphone sound in small blocks
// (128 samples each), mixes the channels down to one, and sends a copy of each block to app.js.
// No imports or exports: browsers always load worklet files this way.
class RecorderProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const channels = inputs[0];
        if (channels && channels.length > 0) {
            const mono = new Float32Array(channels[0].length);
            for (const channel of channels) {
                for (let i = 0; i < mono.length; i++) mono[i] += channel[i];
            }
            if (channels.length > 1) {
                for (let i = 0; i < mono.length; i++) mono[i] /= channels.length;
            }
            this.port.postMessage(mono, [mono.buffer]);
        }
        return true;   // keep running until the page disconnects it
    }
}

registerProcessor("recorder-processor", RecorderProcessor);
