<script setup>
import { ref, computed, onMounted, watch } from "vue";
import ToneCurve from "../components/ToneCurve.vue";

// Display dimensions
const DISPLAY_WIDTH = 800;
const DISPLAY_HEIGHT = 480;

// State
const tab = ref("demo");
const currentVersion = ref("Loading...");
const latestVersion = ref("-");
const selectedVersion = ref("stable");

// Image processing state
const fileInput = ref(null);
const selectedFile = ref(null);
const sourceCanvas = ref(null);
const originalCanvasRef = ref(null);
const processedCanvasRef = ref(null);
const sliderPosition = ref(0);
const isDragging = ref(false);
const processing = ref(false);

// Image processor library
let imageProcessor = null;

// Processing parameters
const currentPreset = ref("cdr");
const params = ref({
  exposure: 1.0,
  saturation: 1.3,
  toneMode: "scurve",
  contrast: 1.0,
  strength: 0.9,
  shadowBoost: 0.0,
  highlightCompress: 1.5,
  midpoint: 0.5,
  colorMethod: "rgb",
  ditherAlgorithm: "floyd-steinberg",
  compressDynamicRange: true,
});

const presetOptions = [
  { title: "CDR", value: "cdr" },
  { title: "S-Curve", value: "scurve" },
  { title: "Custom", value: "custom" },
];

const presetHints = {
  cdr: "Prevents overexposure and generates good image quality for all images. Images will have a slightly darker look.",
  scurve:
    "Advanced tone mapping with brighter output. Some parts of the image may be over-exposed.",
  custom: "Manually adjusted parameters",
};

const toneModeOptions = [
  { title: "Contrast", value: "contrast" },
  { title: "S-Curve", value: "scurve" },
];

const colorMethodOptions = [
  { title: "RGB", value: "rgb" },
  { title: "CIELAB", value: "lab" },
];

const ditherOptions = [
  { title: "Floyd-Steinberg", value: "floyd-steinberg" },
  { title: "Stucki", value: "stucki" },
  { title: "Burkes", value: "burkes" },
  { title: "Sierra", value: "sierra" },
];

const currentPresetHint = computed(() => presetHints[currentPreset.value] || "");
const isApplyingPreset = ref(false);

function matchesPreset(presetName) {
  const target = imageProcessor?.getPreset?.(presetName);
  if (!target) return false;

  const current = params.value;

  const cdrKeys = [
    "exposure",
    "saturation",
    "toneMode",
    "contrast",
    "colorMethod",
    "ditherAlgorithm",
    "compressDynamicRange",
  ];

  const scurveKeys = [
    ...cdrKeys,
    "strength",
    "shadowBoost",
    "highlightCompress",
    "midpoint",
  ];

  const keys = presetName === "scurve" ? scurveKeys : cdrKeys;

  for (const key of keys) {
    if (current[key] !== target[key]) return false;
  }

  return true;
}

function derivePresetFromParams() {
  if (matchesPreset("cdr")) return "cdr";
  if (matchesPreset("scurve")) return "scurve";
  return "custom";
}

watch(
  params,
  () => {
    if (isApplyingPreset.value) return;
    currentPreset.value = derivePresetFromParams();
  },
  { deep: true }
);

onMounted(async () => {
  imageProcessor = await import("epaper-image-convert");
  loadVersionInfo();
  loadSampleImage();
});

async function loadVersionInfo() {
  try {
    const response = await fetch(
      "https://api.github.com/repos/aitjcize/esp32-photoframe/releases/latest"
    );
    const data = await response.json();
    currentVersion.value = data.tag_name;
    latestVersion.value = data.tag_name;
  } catch (error) {
    console.error("Error fetching release:", error);
    currentVersion.value = "1.0.0";
  }
}

async function loadSampleImage() {
  try {
    // sample.jpg is served from publicDir (docs folder)
    const response = await fetch(import.meta.env.BASE_URL + "sample.jpg");
    if (!response.ok) {
      console.log("Sample image not found, waiting for user upload");
      return;
    }
    const blob = await response.blob();
    const file = new File([blob], "sample.jpg", { type: "image/jpeg" });
    await loadImageFromFile(file);
  } catch (error) {
    console.log("Sample image not available:", error.message);
  }
}

function triggerFileSelect() {
  fileInput.value?.click();
}

async function onFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  await loadImageFromFile(file);
}

async function onDrop(event) {
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type.match("image.*")) {
    await loadImageFromFile(file);
  }
}

async function loadImageFromFile(file) {
  selectedFile.value = file;
  const img = await loadImage(file);
  sourceCanvas.value = document.createElement("canvas");
  sourceCanvas.value.width = img.width;
  sourceCanvas.value.height = img.height;
  const ctx = sourceCanvas.value.getContext("2d");
  ctx.drawImage(img, 0, 0);
  await updatePreviews();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function updatePreviews() {
  if (
    !sourceCanvas.value ||
    !originalCanvasRef.value ||
    !processedCanvasRef.value ||
    !imageProcessor
  )
    return;

  processing.value = true;

  const isPortrait = sourceCanvas.value.height > sourceCanvas.value.width;
  const displayWidth = isPortrait ? DISPLAY_HEIGHT : DISPLAY_WIDTH;
  const displayHeight = isPortrait ? DISPLAY_WIDTH : DISPLAY_HEIGHT;

  // Process image with current params
  const result = imageProcessor.processImage(sourceCanvas.value, {
    displayWidth,
    displayHeight,
    palette: imageProcessor.SPECTRA6,
    params: params.value,
    skipRotation: true,
    usePerceivedOutput: true,
  });

  // Set canvas dimensions
  originalCanvasRef.value.width = displayWidth;
  originalCanvasRef.value.height = displayHeight;
  processedCanvasRef.value.width = displayWidth;
  processedCanvasRef.value.height = displayHeight;

  // Draw original using cover mode (same as webapp)
  const originalResized = imageProcessor.resizeImageCover(
    sourceCanvas.value,
    displayWidth,
    displayHeight
  );
  const originalCtx = originalCanvasRef.value.getContext("2d");
  originalCtx.drawImage(originalResized, 0, 0);

  // Draw processed/dithered result
  const processedCtx = processedCanvasRef.value.getContext("2d");
  processedCtx.drawImage(result.canvas, 0, 0);

  processing.value = false;
}

function startDrag(event) {
  isDragging.value = true;
  updateSliderFromEvent(event);
}

function onDrag(event) {
  if (!isDragging.value) return;
  updateSliderFromEvent(event);
}

function stopDrag() {
  isDragging.value = false;
}

function updateSliderFromEvent(event) {
  const container = event.currentTarget;
  const rect = container.getBoundingClientRect();
  const x = (event.clientX || event.touches?.[0]?.clientX) - rect.left;
  sliderPosition.value = Math.max(0, Math.min(100, (x / rect.width) * 100));
}

function onPresetChange() {
  if (currentPreset.value === "custom") return;

  const preset = imageProcessor?.getPreset?.(currentPreset.value);
  if (preset) {
    isApplyingPreset.value = true;
    Object.assign(params.value, preset);
    queueMicrotask(() => {
      isApplyingPreset.value = false;
    });
    updatePreviews();
  }
}

function switchToCustom() {
  currentPreset.value = "custom";
}

function resetParams() {
  currentPreset.value = "cdr";
  const preset = imageProcessor?.getPreset?.("cdr");
  if (preset) {
    isApplyingPreset.value = true;
    Object.assign(params.value, preset);
    queueMicrotask(() => {
      isApplyingPreset.value = false;
    });
  }
  updatePreviews();
}

function newImage() {
  selectedFile.value = null;
  sourceCanvas.value = null;
  if (fileInput.value) {
    fileInput.value.value = "";
  }
}
</script>

<template>
  <v-app>
    <!-- Header -->
    <v-app-bar
      color="primary"
      dark
    >
      <v-toolbar-title>
        <v-icon
          icon="mdi-image-frame"
          class="mr-2"
        />
        ESP32 PhotoFrame - Demo & Flash
      </v-toolbar-title>
      <v-spacer />
      <v-chip
        variant="outlined"
        class="mr-2"
      >
        {{ currentVersion }}
      </v-chip>
    </v-app-bar>

    <v-main class="bg-grey-lighten-4">
      <v-container
        class="py-6"
        style="max-width: 1400px"
      >
        <!-- Tabs -->
        <v-tabs
          v-model="tab"
          color="primary"
          class="mb-6"
        >
          <v-tab value="demo">
            <v-icon
              icon="mdi-image-edit"
              start
            />
            Image Processing Demo
          </v-tab>
          <v-tab value="flash">
            <v-icon
              icon="mdi-flash"
              start
            />
            Flash Firmware
          </v-tab>
        </v-tabs>

        <v-tabs-window v-model="tab">
          <!-- Demo Tab -->
          <v-tabs-window-item value="demo">
            <v-row>
              <!-- Left: Upload / Preview -->
              <v-col
                cols="12"
                lg="8"
              >
                <v-card>
                  <v-card-title>
                    <v-icon
                      icon="mdi-compare"
                      class="mr-2"
                    />
                    Original vs Processed Comparison
                  </v-card-title>

                  <v-card-text>
                    <!-- Upload Area -->
                    <v-sheet
                      v-if="!selectedFile"
                      class="d-flex flex-column align-center justify-center pa-8"
                      color="grey-lighten-3"
                      rounded
                      min-height="300"
                      style="cursor: pointer; border: 2px dashed #ccc"
                      @click="triggerFileSelect"
                      @dragover.prevent
                      @drop.prevent="onDrop"
                    >
                      <v-icon
                        icon="mdi-cloud-upload"
                        size="64"
                        color="grey"
                      />
                      <p class="text-h6 mt-4">
                        Click or drag image to upload
                      </p>
                      <p class="text-body-2 text-grey">
                        Supports: JPG, PNG, WebP
                      </p>
                    </v-sheet>

                    <!-- Comparison Preview -->
                    <div v-else>
                      <div class="d-flex justify-end mb-2">
                        <v-btn
                          variant="text"
                          size="small"
                          @click="newImage"
                        >
                          <v-icon
                            icon="mdi-refresh"
                            start
                          />
                          New Image
                        </v-btn>
                      </div>

                      <div
                        class="comparison-container"
                        @mousedown="startDrag"
                        @mousemove="onDrag"
                        @mouseup="stopDrag"
                        @mouseleave="stopDrag"
                        @touchstart="startDrag"
                        @touchmove="onDrag"
                        @touchend="stopDrag"
                      >
                        <div class="canvas-wrapper">
                          <canvas
                            ref="originalCanvasRef"
                            class="preview-canvas"
                          />
                          <canvas
                            ref="processedCanvasRef"
                            class="preview-canvas processed"
                            :style="{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }"
                          />
                          <div
                            class="slider-line"
                            :style="{ left: `${sliderPosition}%` }"
                          >
                            <div class="slider-handle">
                              <v-icon size="small">
                                mdi-arrow-left-right
                              </v-icon>
                            </div>
                          </div>
                        </div>
                        <div class="comparison-labels d-flex justify-space-between mt-2">
                          <span class="text-caption">← Original</span>
                          <span class="text-caption">Processed →</span>
                        </div>
                      </div>
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Right: Controls -->
              <v-col
                cols="12"
                lg="4"
              >
                <!-- Tone Curve Card -->
                <v-card class="mb-4">
                  <v-card-title class="text-body-1">
                    Tone Curve
                  </v-card-title>
                  <v-card-text class="d-flex justify-center">
                    <ToneCurve
                      :params="params"
                      :size="200"
                    />
                  </v-card-text>
                </v-card>

                <!-- Preset Card -->
                <v-card class="mb-4">
                  <v-card-title class="text-body-1">
                    Preset
                  </v-card-title>
                  <v-card-text>
                    <v-btn-toggle
                      v-model="currentPreset"
                      mandatory
                      color="primary"
                      variant="outlined"
                      class="mb-2"
                      @update:model-value="onPresetChange"
                    >
                      <v-btn
                        v-for="p in presetOptions"
                        :key="p.value"
                        :value="p.value"
                        size="small"
                      >
                        {{ p.title }}
                      </v-btn>
                    </v-btn-toggle>
                    <p class="text-caption text-grey">
                      {{ currentPresetHint }}
                    </p>
                  </v-card-text>
                </v-card>

                <!-- Parameters Card -->
                <v-card>
                  <v-card-title class="text-body-1">
                    Parameters
                  </v-card-title>
                  <v-card-text>
                    <!-- Basic adjustments -->
                    <v-slider
                      v-model="params.exposure"
                      label="Exposure"
                      :min="0.5"
                      :max="2.0"
                      :step="0.05"
                      thumb-label
                      density="compact"
                      color="primary"
                      @update:model-value="
                        switchToCustom();
                        updatePreviews();
                      "
                    />
                    <v-slider
                      v-model="params.saturation"
                      label="Saturation"
                      :min="0.5"
                      :max="2.0"
                      :step="0.05"
                      thumb-label
                      density="compact"
                      color="primary"
                      @update:model-value="
                        switchToCustom();
                        updatePreviews();
                      "
                    />

                    <v-divider class="my-3" />

                    <!-- Tone Mode -->
                    <div class="text-caption text-grey mb-1">
                      Tone Mode
                    </div>
                    <v-btn-toggle
                      v-model="params.toneMode"
                      mandatory
                      density="compact"
                      color="primary"
                      variant="outlined"
                      class="mb-3"
                      @update:model-value="
                        switchToCustom();
                        updatePreviews();
                      "
                    >
                      <v-btn
                        v-for="opt in toneModeOptions"
                        :key="opt.value"
                        :value="opt.value"
                        size="small"
                      >
                        {{ opt.title }}
                      </v-btn>
                    </v-btn-toggle>

                    <!-- Contrast (shown when toneMode is contrast) -->
                    <v-slider
                      v-if="params.toneMode === 'contrast'"
                      v-model="params.contrast"
                      label="Contrast"
                      :min="0.5"
                      :max="2.0"
                      :step="0.05"
                      thumb-label
                      density="compact"
                      color="primary"
                      @update:model-value="
                        switchToCustom();
                        updatePreviews();
                      "
                    />

                    <!-- S-Curve params (shown when toneMode is scurve) -->
                    <template v-if="params.toneMode === 'scurve'">
                      <v-slider
                        v-model="params.strength"
                        label="S-Curve Strength"
                        :min="0"
                        :max="1"
                        :step="0.05"
                        thumb-label
                        density="compact"
                        color="primary"
                        @update:model-value="
                          switchToCustom();
                          updatePreviews();
                        "
                      />
                      <v-slider
                        v-model="params.shadowBoost"
                        label="Shadow Boost"
                        :min="0"
                        :max="1"
                        :step="0.05"
                        thumb-label
                        density="compact"
                        color="primary"
                        @update:model-value="
                          switchToCustom();
                          updatePreviews();
                        "
                      />
                      <v-slider
                        v-model="params.highlightCompress"
                        label="Highlight Compress"
                        :min="0.5"
                        :max="5"
                        :step="0.1"
                        thumb-label
                        density="compact"
                        color="primary"
                        @update:model-value="
                          switchToCustom();
                          updatePreviews();
                        "
                      />
                      <v-slider
                        v-model="params.midpoint"
                        label="Midpoint"
                        :min="0.2"
                        :max="0.8"
                        :step="0.05"
                        thumb-label
                        density="compact"
                        color="primary"
                        @update:model-value="
                          switchToCustom();
                          updatePreviews();
                        "
                      />
                    </template>

                    <v-divider class="my-3" />

                    <!-- Dithering options -->
                    <div class="text-caption text-grey mb-1">
                      Dither Algorithm
                    </div>
                    <v-btn-toggle
                      v-model="params.ditherAlgorithm"
                      mandatory
                      density="compact"
                      color="primary"
                      variant="outlined"
                      class="mb-3"
                      @update:model-value="updatePreviews()"
                    >
                      <v-btn
                        v-for="opt in ditherOptions"
                        :key="opt.value"
                        :value="opt.value"
                        size="x-small"
                      >
                        {{ opt.title }}
                      </v-btn>
                    </v-btn-toggle>

                    <!-- Color Method -->
                    <div class="text-caption text-grey mb-1">
                      Color Matching
                    </div>
                    <v-btn-toggle
                      v-model="params.colorMethod"
                      mandatory
                      density="compact"
                      color="primary"
                      variant="outlined"
                      class="mb-3"
                      @update:model-value="updatePreviews()"
                    >
                      <v-btn
                        v-for="opt in colorMethodOptions"
                        :key="opt.value"
                        :value="opt.value"
                        size="small"
                      >
                        {{ opt.title }}
                      </v-btn>
                    </v-btn-toggle>

                    <!-- Compress Dynamic Range -->
                    <v-checkbox
                      v-model="params.compressDynamicRange"
                      label="Compress Dynamic Range"
                      color="primary"
                      false-icon="mdi-checkbox-blank-outline"
                      true-icon="mdi-checkbox-marked"
                      density="compact"
                      hide-details
                      @update:model-value="
                        switchToCustom();
                        updatePreviews();
                      "
                    />

                    <v-btn
                      variant="outlined"
                      size="small"
                      class="mt-4"
                      block
                      @click="resetParams"
                    >
                      <v-icon
                        icon="mdi-restore"
                        start
                      />
                      Reset to CDR
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-tabs-window-item>

          <!-- Flash Tab -->
          <v-tabs-window-item value="flash">
            <v-row justify="center">
              <v-col
                cols="12"
                md="8"
              >
                <v-card>
                  <v-card-title>
                    <v-icon
                      icon="mdi-flash"
                      class="mr-2"
                    />
                    Flash Firmware to Device
                  </v-card-title>

                  <v-card-text>
                    <v-alert
                      type="info"
                      variant="tonal"
                      class="mb-4"
                    >
                      <strong>Requirements:</strong>
                      <ul class="mt-2">
                        <li>Chrome or Edge browser (WebSerial API required)</li>
                        <li>ESP32-S3 device connected via USB</li>
                        <li>Device in download mode (hold BOOT button while connecting)</li>
                      </ul>
                    </v-alert>

                    <v-select
                      v-model="selectedVersion"
                      :items="[
                        { title: `Stable Release (${currentVersion})`, value: 'stable' },
                        { title: 'Development (latest)', value: 'dev' },
                      ]"
                      label="Firmware Version"
                      variant="outlined"
                      class="mb-4"
                    />

                    <v-alert
                      v-if="selectedVersion === 'dev'"
                      type="warning"
                      variant="tonal"
                      class="mb-4"
                    >
                      Development builds may be unstable. Use at your own risk.
                    </v-alert>

                    <div class="d-flex justify-center">
                      <esp-web-install-button
                        :manifest="
                          selectedVersion === 'dev' ? './manifest-dev.json' : './manifest.json'
                        "
                      >
                        <template #activate>
                          <button class="flash-button">
                            <v-icon
                              icon="mdi-flash"
                              class="mr-2"
                            />
                            Connect & Flash
                          </button>
                        </template>
                      </esp-web-install-button>
                    </div>
                  </v-card-text>
                </v-card>

                <!-- Setup Instructions -->
                <v-card class="mt-4">
                  <v-card-title>Setup Instructions</v-card-title>
                  <v-card-text>
                    <v-timeline
                      density="compact"
                      side="end"
                    >
                      <v-timeline-item
                        dot-color="primary"
                        size="small"
                      >
                        <div class="text-body-2">
                          <strong>1. Flash Firmware</strong><br>
                          Use the button above to flash the firmware to your ESP32-S3.
                        </div>
                      </v-timeline-item>
                      <v-timeline-item
                        dot-color="primary"
                        size="small"
                      >
                        <div class="text-body-2">
                          <strong>2. Connect to WiFi</strong><br>
                          After flashing, connect to the "PhotoFrame-XXXX" WiFi network and
                          configure your WiFi credentials.
                        </div>
                      </v-timeline-item>
                      <v-timeline-item
                        dot-color="primary"
                        size="small"
                      >
                        <div class="text-body-2">
                          <strong>3. Access Web Interface</strong><br>
                          Once connected, access the web interface at
                          <code>http://photoframe.local</code>
                        </div>
                      </v-timeline-item>
                      <v-timeline-item
                        dot-color="primary"
                        size="small"
                      >
                        <div class="text-body-2">
                          <strong>4. Upload Images</strong><br>
                          Use the web interface to upload and manage your photos.
                        </div>
                      </v-timeline-item>
                    </v-timeline>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-container>
    </v-main>
  </v-app>

  <input
    ref="fileInput"
    type="file"
    accept="image/*"
    style="display: none"
    @change="onFileSelected"
  >
</template>

<style scoped>
.comparison-container {
  position: relative;
  cursor: ew-resize;
  user-select: none;
}

.canvas-wrapper {
  position: relative;
  display: inline-block;
}

.preview-canvas {
  display: block;
  max-width: 100%;
  height: auto;
}

.preview-canvas.processed {
  position: absolute;
  top: 0;
  left: 0;
}

.slider-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: white;
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.slider-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.flash-button {
  padding: 16px 32px;
  font-size: 1.1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.3s;
}

.flash-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}
</style>
