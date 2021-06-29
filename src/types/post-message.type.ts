import { Mp3WorkerEncodingConfig } from './config.type';

export enum PostMessageType {
    DATA_AVAILABLE = 'DATA_AVAILABLE',
    START_RECORDING = 'START_RECORDING',
    STOP_RECORDING = 'STOP_RECORDING',
    ERROR = 'ERROR',
    BLOB_READY = 'BLOB_READY',
    WORKER_RECORDING = 'WORKER_RECORDING',
}
export const errorMessage = (error: string) => ({ type: PostMessageType.ERROR as PostMessageType.ERROR, error });
export const startRecordingMessage = (config: Mp3WorkerEncodingConfig) => ({
    type: PostMessageType.START_RECORDING as PostMessageType.START_RECORDING,
    config,
});
export const workerRecordingMessage = () => ({
    type: PostMessageType.WORKER_RECORDING as PostMessageType.WORKER_RECORDING,
});

export const dataAvailableMessage = (data: Float32Array) => ({
    type: PostMessageType.DATA_AVAILABLE as PostMessageType.DATA_AVAILABLE,
    data,
});

export const blobReadyMessage = (blob: Blob) => ({
    type: PostMessageType.BLOB_READY as PostMessageType.BLOB_READY,
    blob,
});
export const stopRecordingMessage = () => ({
    type: PostMessageType.STOP_RECORDING as PostMessageType.STOP_RECORDING,
});

export type WorkerPostMessage = ReturnType<
    | typeof errorMessage
    | typeof startRecordingMessage
    | typeof dataAvailableMessage
    | typeof blobReadyMessage
    | typeof stopRecordingMessage
    | typeof workerRecordingMessage
>;
