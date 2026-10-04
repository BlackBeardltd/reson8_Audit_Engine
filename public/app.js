const input = document.querySelector("#audioFile");
const dropzone = document.querySelector("#dropzone");
const filePanel = document.querySelector("#filePanel");
const fileName = document.querySelector("#fileName");
const fileDetails = document.querySelector("#fileDetails");
const removeFile = document.querySelector("#removeFile");
const submit = document.querySelector("#submitAudit");
const actionMessage = document.querySelector("#actionMessage");
const preflightState = document.querySelector("#preflightState");
const resultPanel = document.querySelector("#resultPanel");
const jobId = document.querySelector("#jobId");
const serverHash = document.querySelector("#serverHash");

const checks = {
  type: document.querySelector("#checkType"),
  size: document.querySelector("#checkSize"),
  hash: document.querySelector("#checkHash"),
};

let selectedFile = null;
let digest = null;

const MAX_BYTES = 50 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "aac", "ogg", "m4a"]);

function setCheck(el, state, value) {
  el.classList.remove("ok", "bad");
  if (state) el.classList.add(state);
  el.querySelector("b").textContent = value;
}

function extensionOf(name) {
  return name.includes(".") ? name.split(".").pop().toLowerCase() : "";
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

async function sha256(file) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function inspect(file) {
  selectedFile = file;
  digest = null;
  resultPanel.classList.add("hidden");
  filePanel.classList.remove("hidden");
  fileName.textContent = file.name;
  fileDetails.textContent = formatBytes(file.size) + " · " + (file.type || "audio") + " · " + extensionOf(file.name).toUpperCase();

  const validType = AUDIO_EXTENSIONS.has(extensionOf(file.name));
  const validSize = file.size > 0 && file.size <= MAX_BYTES;

  setCheck(checks.type, validType ? "ok" : "bad", validType ? "PASS" : "INVALID");
  setCheck(checks.size, validSize ? "ok" : "bad", validSize ? "PASS" : "OVER LIMIT");

  if (validType && validSize) {
    preflightState.textContent = "Computing integrity…";
    try {
      digest = await sha256(file);
      setCheck(checks.hash, "ok", digest.slice(0, 12) + "…");
      preflightState.textContent = "Ready for secure intake";
      submit.disabled = false;
      actionMessage.textContent = "Ready. The server will validate and hash the master again.";
    } catch {
      setCheck(checks.hash, "bad", "FAILED");
      preflightState.textContent = "Integrity check failed";
      submit.disabled = true;
      actionMessage.textContent = "Could not calculate the local integrity hash.";
    }
  } else {
    setCheck(checks.hash, "", "—");
    preflightState.textContent = "Fix the source file";
    submit.disabled = true;
    actionMessage.textContent = "Choose a supported audio file under 50 MB.";
  }
}

function clearFile() {
  selectedFile = null;
  digest = null;
  input.value = "";
  filePanel.classList.add("hidden");
  submit.disabled = true;
  preflightState.textContent = "Waiting for source";
  actionMessage.textContent = "Select a valid master to continue.";
  setCheck(checks.type, "", "—");
  setCheck(checks.size, "", "—");
  setCheck(checks.hash, "", "—");
}

input.addEventListener("change", () => input.files?.[0] && inspect(input.files[0]));
removeFile.addEventListener("click", clearFile);

["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, e => {
  e.preventDefault();
  dropzone.classList.add("dragover");
}));
["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, e => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
}));
dropzone.addEventListener("drop", e => {
  const file = e.dataTransfer?.files?.[0];
  if (file) inspect(file);
});

submit.addEventListener("click", async () => {
  if (!selectedFile || !digest) return;

  submit.disabled = true;
  submit.querySelector("span").textContent = "Submitting…";
  actionMessage.textContent = "Uploading the private master to the audit queue…";

  const token = window.RESON8_AUDIT_TOKEN;
  if (!token) {
    submit.disabled = false;
    submit.querySelector("span").textContent = "Start A&R audit";
    actionMessage.textContent = "Authentication session required. Sign in through the host application before submitting.";
    return;
  }

  try {
    const response = await fetch("/v1/audits", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": selectedFile.type || "application/octet-stream",
        "X-Audio-Filename": selectedFile.name,
      },
      body: selectedFile,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Audit intake failed");

    jobId.textContent = payload.jobId || "—";
    serverHash.textContent = payload.sha256 || "—";
    resultPanel.classList.remove("hidden");
    actionMessage.textContent = "Accepted. Processing has been queued.";
    submit.querySelector("span").textContent = "Audit queued";
  } catch (error) {
    actionMessage.textContent = error instanceof Error ? error.message : "Audit intake failed.";
    submit.disabled = false;
    submit.querySelector("span").textContent = "Start A&R audit";
  }
});
