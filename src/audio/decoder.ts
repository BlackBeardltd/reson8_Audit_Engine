import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
}

export interface AudioDecoder {
  decode(bytes: Uint8Array): Promise<DecodedAudio>;
}

type FloatDecoder = (bytes: Uint8Array) => Promise<Float32Array>;

export function createAudioDecoder(floatDecoder?: FloatDecoder): AudioDecoder {
  if (floatDecoder) {
    return {
      async decode(bytes) {
        const samples = await floatDecoder(bytes);
        return { samples, sampleRate: 44100, channels: 1 };
      },
    };
  }

  if (!ffmpegPath) throw new Error("FFmpeg binary is unavailable");

  return {
    decode(bytes) {
      return decodeWithFfmpeg(bytes);
    },
  };
}

async function decodeWithFfmpeg(bytes: Uint8Array): Promise<DecodedAudio> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath!, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-f",
      "f32le",
      "pipe:1",
    ]);

    const chunks: Buffer[] = [];
    let stderr = "";

    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Audio decode failed: ${stderr.trim() || `ffmpeg exited ${code}`}`));
        return;
      }

      const buffer = Buffer.concat(chunks);
      const aligned = buffer.subarray(0, buffer.byteLength - (buffer.byteLength % 4));
      resolve({
        samples: new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4),
        sampleRate: 44100,
        channels: 1,
      });
    });

    ffmpeg.stdin.end(Buffer.from(bytes));
  });
}
