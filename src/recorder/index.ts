import { defineEventAttribute, EventTarget } from 'event-target-shim';
import {
    dataAvailableMessage,
    PostMessageType,
    startRecordingMessage,
    stopRecordingMessage,
    WorkerPostMessage,
} from '../types/post-message.type';

export interface Mp3MediaRecorderOptions extends MediaRecorderOptions {
    worker: Worker;
    audioContext?: AudioContext;
}

const MP3_MIME_TYPE = 'audio/mpeg';
const SafeAudioContext: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
const createGain = (ctx: AudioContext) => (ctx.createGain || (ctx as any).createGainNode).call(ctx);
const createScriptProcessor = (ctx: AudioContext) =>
    (ctx.createScriptProcessor || (ctx as any).createJavaScriptNode).call(ctx, 4096, 1, 1);
const clamp = (min: number, max: number) => (value: number): number => Math.min(Math.max(value, min), max);

const mergeAudioChannels = (buffer: AudioBuffer): Float32Array => {
    const channels = new Array(buffer.numberOfChannels).fill(null).map((_, i) => buffer.getChannelData(i));
    const mergedChannelData: number[] = [];

    for (let index = 0; index < channels[0].length; index++) {
        const mergedSample = channels.reduce(
            (result, channel) => clamp(-2_147_483_648, 2_147_483_647)(result + channel[index]),
            0
        );
        mergedChannelData.push(mergedSample);
    }

    return new Float32Array(mergedChannelData);
};

export class Mp3MediaRecorder extends EventTarget {
    stream: MediaStream;
    mimeType = MP3_MIME_TYPE;
    state: RecordingState = 'inactive';
    audioBitsPerSecond = 0;
    videoBitsPerSecond = 0;

    private audioContext: AudioContext;
    private sourceNode: MediaStreamAudioSourceNode;
    private gainNode: GainNode;
    private processorNode: ScriptProcessorNode;
    private worker: Worker;
    private isInternalAudioContext = false;

    static isTypeSupported = (mimeType: string) => mimeType === MP3_MIME_TYPE;

    constructor(stream: MediaStream, { audioContext, worker }: Mp3MediaRecorderOptions) {
        super();

        if (!worker) {
            throw new Error('No worker provided in Mp3MediaRecorder constructor.');
        }
        this.stream = stream;
        this.isInternalAudioContext = !audioContext;
        this.audioContext = audioContext || new SafeAudioContext();
        this.worker = worker;
        this.sourceNode = this.audioContext.createMediaStreamSource(stream);
        this.gainNode = createGain(this.audioContext);
        this.gainNode.gain.value = 1;
        this.processorNode = createScriptProcessor(this.audioContext);
        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.processorNode);
        this.worker.onmessage = this.onWorkerMessage;
    }

    start(): void {
        if (this.state !== 'inactive') {
            throw this.getStateError('start');
        }
        this.processorNode.onaudioprocess = (event) => {
            this.worker.postMessage(dataAvailableMessage(mergeAudioChannels(event.inputBuffer)));
        };
        this.processorNode.connect(this.audioContext.destination);
        if (this.audioContext.state === 'closed') {
            this.audioContext = new AudioContext();
        } else if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.worker.postMessage(startRecordingMessage({ sampleRate: this.audioContext.sampleRate }));
    }

    stop(): void {
        if (this.state === 'inactive') {
            throw this.getStateError('stop');
        }
        this.processorNode.disconnect();
        if (this.isInternalAudioContext) {
            this.audioContext.close();
        }
        this.worker.postMessage(stopRecordingMessage());
    }

    pause(): void {
        if (this.state === 'inactive') {
            throw this.getStateError('pause');
        }
        this.audioContext.suspend().then(() => {
            this.state = 'paused';
            this.dispatchEvent(new Event('pause'));
        });
    }

    resume(): void {
        if (this.state === 'inactive') {
            throw this.getStateError('resume');
        }
        this.audioContext.resume().then(() => {
            this.state = 'recording';
            this.dispatchEvent(new Event('resume'));
        });
    }

    requestData(): void {
        // not implemented, dataavailable event only fires when encoding is finished
    }

    private getStateError(method: string) {
        return new Error(
            `Failed to execute '${method}' on 'MediaRecorder': The MediaRecorder's state is '${this.state}'.`
        );
    }

    private onWorkerMessage = (event: MessageEvent): void => {
        const message: WorkerPostMessage = event.data;

        switch (message.type) {
            case PostMessageType.WORKER_RECORDING: {
                const event = new Event('start');
                this.dispatchEvent(event);
                this.state = 'recording';
                break;
            }
            case PostMessageType.ERROR: {
                const error = new Error(message.error) as DOMException;
                const errEvent = new Event('error');
                (errEvent as any).error = error;
                this.dispatchEvent(errEvent);
                this.state = 'inactive';
                break;
            }
            case PostMessageType.BLOB_READY: {
                const stopEvent = new Event('stop');
                const fallbackDataEvent = new Event('dataavailable');
                (fallbackDataEvent as any).data = message.blob;
                (fallbackDataEvent as any).timecode = Date.now();
                const dataEvent = window.BlobEvent
                    ? new BlobEvent('dataavailable', {
                          data: message.blob,
                          timecode: Date.now(),
                      })
                    : fallbackDataEvent;
                this.dispatchEvent(dataEvent);
                this.dispatchEvent(stopEvent);
                this.state = 'inactive';
                break;
            }
            case PostMessageType.ERROR: {
                throw new Error(message.error);
            }
        }
    };
}

defineEventAttribute(Mp3MediaRecorder.prototype, 'start');
defineEventAttribute(Mp3MediaRecorder.prototype, 'stop');
defineEventAttribute(Mp3MediaRecorder.prototype, 'pause');
defineEventAttribute(Mp3MediaRecorder.prototype, 'resume');
defineEventAttribute(Mp3MediaRecorder.prototype, 'dataavailable');
defineEventAttribute(Mp3MediaRecorder.prototype, 'error');

declare module './index' {
    interface Mp3MediaRecorder
        extends Pick<MediaRecorder, 'onstart' | 'onstop' | 'onpause' | 'onresume' | 'ondataavailable' | 'onerror'> {}
}
