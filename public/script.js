const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const gridSelect = document.getElementById("gridSelect");
const assetTypeSelect = document.getElementById("assetTypeSelect");
const marginInput = document.getElementById("marginInput");
const toleranceInput = document.getElementById("toleranceInput");
const toleranceValue = document.getElementById("toleranceValue");
const removeBackgroundInput = document.getElementById("removeBackground");
const miricanvasMode = document.getElementById("miricanvasMode");
const dpiSelect = document.getElementById("dpiSelect");
const sizeModeSelect = document.getElementById("sizeModeSelect");

const sourceGrid = document.getElementById("sourceGrid");
const sourceSelectAll = document.getElementById("sourceSelectAll");
const sourceClearAll = document.getElementById("sourceClearAll");
const deleteSelectedSources = document.getElementById("deleteSelectedSources");
const uploadCount = document.getElementById("uploadCount");

const resultPanel = document.getElementById("resultPanel");
const resultGrid = document.getElementById("resultGrid");
const resultSelectAll = document.getElementById("resultSelectAll");
const resultClearAll = document.getElementById("resultClearAll");
const resultCount = document.getElementById("resultCount");

const processButton = document.getElementById("processButton");
const chooseFolderButton = document.getElementById("chooseFolderButton");
const addFilesButton = document.getElementById("addFilesButton");
const downloadSelectedButton = document.getElementById("downloadSelectedButton");
const downloadZipButton = document.getElementById("downloadZipButton");
const resetButton = document.getElementById("resetButton");
const statusText = document.getElementById("status");

let sourceItems = [];
let resultItems = [];
let directoryHandle = null;

toleranceInput.addEventListener("input", () => {
  toleranceValue.textContent = toleranceInput.value;
});

fileInput.addEventListener("change", () => addFiles(fileInput.files));
addFilesButton.addEventListener("click", () => fileInput.click());

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (event) => {
  addFiles(event.dataTransfer.files);
});

function addFiles(files) {
  const allowed = ["image/png", "image/jpeg", "image/webp"];

  Array.from(files).forEach((file) => {
    if (!allowed.includes(file.type)) return;

    sourceItems.push({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      selected: true
    });
  });

  fileInput.value = "";
  renderSources();
  statusText.textContent = `${sourceItems.length}장의 이미지를 준비했습니다.`;
}

function renderSources() {
  uploadCount.textContent = `${sourceItems.length}장`;

  if (!sourceItems.length) {
    sourceGrid.className = "card-grid empty-state";
    sourceGrid.textContent = "이미지를 추가하면 여기에 미리보기가 표시됩니다.";
    return;
  }

  sourceGrid.className = "card-grid";
  sourceGrid.innerHTML = "";

  sourceItems.forEach((item) => {
    const card = document.createElement("article");
    card.className = `preview-card${item.selected ? " selected" : ""}`;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "card-check";
    check.checked = item.selected;
    check.addEventListener("change", () => {
      item.selected = check.checked;
      renderSources();
    });

    const imageWrap = document.createElement("div");
    imageWrap.className = "preview-image-wrap";

    const image = document.createElement("img");
    image.src = item.url;
    image.alt = item.file.name;
    imageWrap.appendChild(image);

    const info = document.createElement("div");
    info.className = "card-info";
    info.innerHTML = `<strong>${escapeHtml(item.file.name)}</strong><small>${formatSize(item.file.size)}</small>`;

    card.append(check, imageWrap, info);
    sourceGrid.appendChild(card);
  });
}

sourceSelectAll.addEventListener("click", () => {
  sourceItems.forEach((item) => item.selected = true);
  renderSources();
});

sourceClearAll.addEventListener("click", () => {
  sourceItems.forEach((item) => item.selected = false);
  renderSources();
});

deleteSelectedSources.addEventListener("click", () => {
  const removed = sourceItems.filter((item) => item.selected);
  removed.forEach((item) => URL.revokeObjectURL(item.url));
  sourceItems = sourceItems.filter((item) => !item.selected);
  renderSources();
});

processButton.addEventListener("click", async () => {
  const targets = sourceItems.filter((item) => item.selected);

  if (!targets.length) {
    alert("처리할 이미지를 체크해주세요.");
    return;
  }

  processButton.disabled = true;
  resultItems.forEach((item) => URL.revokeObjectURL(item.url));
  resultItems = [];
  renderResults();

  try {
    const gridCount = Number(gridSelect.value);
    const margin = clamp(Number(marginInput.value) || 0, 0, 150);
    const tolerance = Number(toleranceInput.value);
    const removeBackground = removeBackgroundInput.checked;
    const dpi = Number(dpiSelect.value);
    const total = targets.length * gridCount * gridCount;
    let done = 0;

    for (const source of targets) {
      const image = await loadImage(source.file);
      const sourceCanvas = imageToCanvas(image);

      for (let row = 0; row < gridCount; row += 1) {
        for (let col = 0; col < gridCount; col += 1) {
          done += 1;
          statusText.textContent = `${done}/${total} 요소 처리 중...`;

          const cellCanvas = extractCell(sourceCanvas, row, col, gridCount);
          let processed = processCell(cellCanvas, margin, tolerance, removeBackground);

          const requiredMin = getRequiredMinimumSize();
          if (miricanvasMode.checked) {
            processed = normalizeCanvasSize(processed, requiredMin, 9800);
          }

          const rawBlob = await canvasToBlob(processed);
          const pngBlob = await addPngDpiMetadata(rawBlob, dpi);

          const baseName = source.file.name.replace(/\.[^.]+$/, "");
          const index = row * gridCount + col + 1;
          const filename = `${baseName}_element_${String(index).padStart(2, "0")}.png`;

          const compliance = evaluateCompliance(
            processed.width,
            processed.height,
            pngBlob.size,
            requiredMin
          );

          resultItems.push({
            id: crypto.randomUUID(),
            filename,
            blob: pngBlob,
            url: URL.createObjectURL(pngBlob),
            width: processed.width,
            height: processed.height,
            dpi,
            size: pngBlob.size,
            compliance,
            selected: compliance.ok
          });
        }
      }
    }

    renderResults();
    resultPanel.classList.remove("hidden");
    const okCount = resultItems.filter((item) => item.compliance.ok).length;
    statusText.textContent =
      `완료: ${resultItems.length}개 생성 · 미리캔버스 기준 통과 ${okCount}개`;
  } catch (error) {
    console.error(error);
    statusText.textContent = "처리 중 오류가 발생했습니다.";
    alert(error.message || "이미지 처리 중 오류가 발생했습니다.");
  } finally {
    processButton.disabled = false;
  }
});

function getRequiredMinimumSize() {
  const selectedMode = sizeModeSelect.value;
  if (selectedMode !== "auto") return Number(selectedMode);
  return assetTypeSelect.value === "icon" ? 700 : 1500;
}

function normalizeCanvasSize(canvas, minSize, maxSize) {
  const currentMin = Math.min(canvas.width, canvas.height);
  const currentMax = Math.max(canvas.width, canvas.height);

  let scale = 1;

  if (currentMin < minSize) {
    scale = minSize / currentMin;
  }

  if (currentMax * scale > maxSize) {
    scale = maxSize / currentMax;
  }

  if (Math.abs(scale - 1) < 0.001) return canvas;

  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(canvas.width * scale));
  output.height = Math.max(1, Math.round(canvas.height * scale));

  const ctx = output.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, output.width, output.height);

  return output;
}

function evaluateCompliance(width, height, bytes, minSize) {
  const reasons = [];

  if (Math.min(width, height) < minSize) {
    reasons.push(`최소 크기 ${minSize}px 미달`);
  }

  if (Math.max(width, height) > 9800) {
    reasons.push("최대 크기 9800px 초과");
  }

  if (bytes > 50 * 1024 * 1024) {
    reasons.push("파일 크기 50MB 초과");
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}

function imageToCanvas(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0);
  return canvas;
}

function extractCell(sourceCanvas, row, col, gridCount) {
  const startX = Math.floor(col * sourceCanvas.width / gridCount);
  const endX = Math.floor((col + 1) * sourceCanvas.width / gridCount);
  const startY = Math.floor(row * sourceCanvas.height / gridCount);
  const endY = Math.floor((row + 1) * sourceCanvas.height / gridCount);

  const canvas = document.createElement("canvas");
  canvas.width = endX - startX;
  canvas.height = endY - startY;

  canvas.getContext("2d", { willReadFrequently: true }).drawImage(
    sourceCanvas,
    startX, startY, canvas.width, canvas.height,
    0, 0, canvas.width, canvas.height
  );

  return canvas;
}

function processCell(cellCanvas, margin, tolerance, removeBackground) {
  const ctx = cellCanvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, cellCanvas.width, cellCanvas.height);

  if (removeBackground && !hasRealTransparency(imageData.data)) {
    floodRemoveBackground(imageData, cellCanvas.width, cellCanvas.height, tolerance);
  }

  const bbox = findAlphaBoundingBox(
    imageData.data,
    cellCanvas.width,
    cellCanvas.height
  );

  if (!bbox) return cellCanvas;

  const masked = document.createElement("canvas");
  masked.width = cellCanvas.width;
  masked.height = cellCanvas.height;
  masked.getContext("2d").putImageData(imageData, 0, 0);

  const minX = Math.max(0, bbox.minX - margin);
  const minY = Math.max(0, bbox.minY - margin);
  const maxX = Math.min(cellCanvas.width - 1, bbox.maxX + margin);
  const maxY = Math.min(cellCanvas.height - 1, bbox.maxY + margin);

  const output = document.createElement("canvas");
  output.width = Math.max(1, maxX - minX + 1);
  output.height = Math.max(1, maxY - minY + 1);

  output.getContext("2d").drawImage(
    masked,
    minX, minY, output.width, output.height,
    0, 0, output.width, output.height
  );

  return output;
}

function hasRealTransparency(data) {
  let count = 0;
  const pixels = data.length / 4;

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) count += 1;
  }

  return count > Math.max(20, pixels * 0.001);
}

function floodRemoveBackground(imageData, width, height, tolerance) {
  const data = imageData.data;
  const bg = estimateBorderColor(data, width, height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  function enqueue(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pos = y * width + x;
    if (visited[pos]) return;
    if (!colorClose(data, pos, bg, tolerance)) return;
    visited[pos] = 1;
    queue[tail++] = pos;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (head < tail) {
    const pos = queue[head++];
    const x = pos % width;
    const y = Math.floor(pos / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  for (let pos = 0; pos < visited.length; pos += 1) {
    if (visited[pos]) data[pos * 4 + 3] = 0;
  }
}

function estimateBorderColor(data, width, height) {
  const samples = [];
  const stepX = Math.max(1, Math.floor(width / 24));
  const stepY = Math.max(1, Math.floor(height / 24));

  const sample = (x, y) => {
    const i = (y * width + x) * 4;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  };

  for (let x = 0; x < width; x += stepX) {
    sample(x, 0);
    sample(x, height - 1);
  }

  for (let y = 0; y < height; y += stepY) {
    sample(0, y);
    sample(width - 1, y);
  }

  const median = (index) => {
    const values = samples.map((s) => s[index]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };

  return [median(0), median(1), median(2)];
}

function colorClose(data, pos, bg, tolerance) {
  const i = pos * 4;
  const dr = data[i] - bg[0];
  const dg = data[i + 1] - bg[1];
  const db = data[i + 2] - bg[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance;
}

function findAlphaBoundingBox(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

function renderResults() {
  resultCount.textContent = `${resultItems.length}개`;
  resultGrid.innerHTML = "";

  resultItems.forEach((item) => {
    const card = document.createElement("article");
    card.className = `preview-card${item.selected ? " selected" : ""}`;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "card-check";
    check.checked = item.selected;
    check.addEventListener("change", () => {
      item.selected = check.checked;
      renderResults();
    });

    const imageWrap = document.createElement("div");
    imageWrap.className = "preview-image-wrap";

    const image = document.createElement("img");
    image.src = item.url;
    image.alt = item.filename;
    imageWrap.appendChild(image);

    const info = document.createElement("div");
    info.className = "card-info";

    const complianceText = item.compliance.ok
      ? `<span class="compliance ok">규정 통과</span>`
      : `<span class="compliance warn">${escapeHtml(item.compliance.reasons.join(", "))}</span>`;

    info.innerHTML = `
      <strong>${escapeHtml(item.filename)}</strong>
      <small>${item.width}×${item.height}px · ${item.dpi}dpi · ${formatSize(item.size)}</small>
      ${complianceText}
    `;

    card.append(check, imageWrap, info);
    resultGrid.appendChild(card);
  });

  const selectedCount = resultItems.filter((item) => item.selected).length;
  downloadSelectedButton.disabled = selectedCount === 0;
  downloadZipButton.disabled = selectedCount === 0;
}

resultSelectAll.addEventListener("click", () => {
  resultItems.forEach((item) => item.selected = true);
  renderResults();
});

resultClearAll.addEventListener("click", () => {
  resultItems.forEach((item) => item.selected = false);
  renderResults();
});

downloadSelectedButton.addEventListener("click", async () => {
  const selected = resultItems.filter((item) => item.selected);

  if (!selected.length) return;

  if (directoryHandle) {
    try {
      for (const item of selected) {
        const handle = await directoryHandle.getFileHandle(item.filename, { create: true });
        const writable = await handle.createWritable();
        await writable.write(item.blob);
        await writable.close();
      }
      statusText.textContent = `${selected.length}개 파일을 선택한 폴더에 저장했습니다.`;
      return;
    } catch (error) {
      console.warn(error);
    }
  }

  selected.forEach((item, index) => {
    setTimeout(() => downloadBlob(item.blob, item.filename), index * 250);
  });
});

downloadZipButton.addEventListener("click", async () => {
  const selected = resultItems.filter((item) => item.selected);
  if (!selected.length) return;
  if (typeof JSZip === "undefined") {
    alert("ZIP 라이브러리를 불러오지 못했습니다.");
    return;
  }

  statusText.textContent = "ZIP 파일 생성 중...";
  const zip = new JSZip();
  selected.forEach((item) => zip.file(item.filename, item.blob));

  const reportLines = selected.map((item) => {
    const result = item.compliance.ok ? "통과" : item.compliance.reasons.join(", ");
    return `${item.filename}\t${item.width}x${item.height}px\t${item.dpi}dpi\t${formatSize(item.size)}\t${result}`;
  });

  zip.file(
    "miricanvas_compliance_report.txt",
    [
      "미리캔버스 업로드 규정 검사 결과",
      "",
      ...reportLines
    ].join("\n")
  );

  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  downloadBlob(zipBlob, "miricanvas_cropped_selected.zip");
  statusText.textContent = `선택한 ${selected.length}개 파일을 ZIP으로 저장했습니다.`;
});

chooseFolderButton.addEventListener("click", async () => {
  if (!window.showDirectoryPicker) {
    alert("이 브라우저에서는 저장 폴더 선택을 지원하지 않습니다. Chrome 또는 Edge에서 사용해주세요.");
    return;
  }

  try {
    directoryHandle = await window.showDirectoryPicker();
    chooseFolderButton.textContent = "📁 저장 폴더 선택됨";
  } catch (error) {
    if (error.name !== "AbortError") console.error(error);
  }
});

resetButton.addEventListener("click", () => {
  sourceItems.forEach((item) => URL.revokeObjectURL(item.url));
  resultItems.forEach((item) => URL.revokeObjectURL(item.url));
  sourceItems = [];
  resultItems = [];
  directoryHandle = null;
  renderSources();
  renderResults();
  resultPanel.classList.add("hidden");
  chooseFolderButton.textContent = "📁 저장 폴더 선택";
  statusText.textContent = "이미지를 추가해주세요.";
});

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} 파일을 열 수 없습니다.`));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("PNG 생성에 실패했습니다."));
      else resolve(blob);
    }, "image/png");
  });
}

async function addPngDpiMetadata(blob, dpi) {
  const buffer = new Uint8Array(await blob.arrayBuffer());

  if (
    buffer.length < 33 ||
    buffer[0] !== 137 ||
    buffer[1] !== 80 ||
    buffer[2] !== 78 ||
    buffer[3] !== 71
  ) {
    return blob;
  }

  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  writeUint32(data, 0, pixelsPerMeter);
  writeUint32(data, 4, pixelsPerMeter);
  data[8] = 1;

  const type = new TextEncoder().encode("pHYs");
  const crcInput = new Uint8Array(type.length + data.length);
  crcInput.set(type, 0);
  crcInput.set(data, type.length);

  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  writeUint32(chunk, 0, 9);
  chunk.set(type, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 17, crc32(crcInput));

  const output = new Uint8Array(buffer.length + chunk.length);
  output.set(buffer.slice(0, 33), 0);
  output.set(chunk, 33);
  output.set(buffer.slice(33), 33 + chunk.length);

  return new Blob([output], { type: "image/png" });
}

function writeUint32(array, offset, value) {
  array[offset] = (value >>> 24) & 255;
  array[offset + 1] = (value >>> 16) & 255;
  array[offset + 2] = (value >>> 8) & 255;
  array[offset + 3] = value & 255;
}

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
