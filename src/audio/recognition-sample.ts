import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

type Runner = (args: string[]) => Promise<Uint8Array>;

export async function createRecognitionSample(
  master: Uint8Array,
  _mimeType: string,
  runner?: Runner,
): Promise<Uint8Array> {
  if (runner) {
    return runner([
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-t",
      "30",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      "pipe:1",
    ]);
  }

  if (!ffmpegPath) throw new Error("FFmpeg binary is unavailable");

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath!, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-t",
      "30",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      "pipe:1",
    ]);

    const chunks: Buffer[] = [];
    let stderr = "";
    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Recognition sample extraction failed: ${stderr.trim() || `ffmpeg exited ${code}`}`));
        return;
      }
      resolve(new Uint8Array(Buffer.concat(chunks)));
    });
    ffmpeg.stdin.end(Buffer.from(master));
  });
}
