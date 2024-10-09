// renderer.js

const selectFileBtn = document.getElementById('selectFileBtn');
const selectedFileSpan = document.getElementById('selectedFile');
const startBtn = document.getElementById('startBtn');
const languageOptionsDiv = document.getElementById('languageOptions');
const apiKeyInput = document.getElementById('apiKeyInput');
const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');
const eyeIcon = document.getElementById('eyeIcon');
const timerDisplay = document.getElementById('timerDisplay');
const progressBarFill = document.getElementById('progressBarFill');
const statusMessage = document.getElementById('statusMessage');
const detectedLanguageDiv = document.getElementById('detectedLanguage');

let selectedVideoPath = null;
let apiKeyVisible = false;
let timerInterval = null;
let startTime = null;

const totalMilestones = 5; // Increased to accommodate detected language display
let milestonesCompleted = 0;

// List of available languages
const languages = [
  { code: 'en', name: 'English' },
  { code: 'ja', name: 'Japanese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  // Add more languages as needed
];

// Populate language options
languages.forEach((lang) => {
  const label = document.createElement('label');
  label.classList.add('mr-4');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = lang.code;
  checkbox.classList.add('mr-1');

  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(lang.name));

  languageOptionsDiv.appendChild(label);
});

// Handle file selection
selectFileBtn.addEventListener('click', async () => {
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    selectedVideoPath = filePath;
    selectedFileSpan.textContent = filePath;
  }
});

// Toggle API key visibility
toggleApiKeyVisibility.addEventListener('click', () => {
  apiKeyVisible = !apiKeyVisible;
  apiKeyInput.type = apiKeyVisible ? 'text' : 'password';

  // Update the eye icon
  eyeIcon.innerHTML = apiKeyVisible
    ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7
        1.045-3.336 3.7-6 7-6 .651 0 1.283.084 1.887.242m2.122-.242c1.87 0 3.577.688
        4.895 1.815m2.12 2.12A9.973 9.973 0 0121.542 12c-1.274 4.057-5.065 7-9.542 7
        -.651 0-1.283-.084-1.887-.242M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>` // Eye-off icon
    : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7
        -1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`; // Eye icon
});

// Handle start processing
startBtn.addEventListener('click', async () => {
  if (!selectedVideoPath) {
    alert('Please select a video file.');
    return;
  }

  // Get selected languages
  const selectedLanguages = Array.from(
    languageOptionsDiv.querySelectorAll('input[type="checkbox"]:checked')
  ).map((checkbox) => checkbox.value);

  if (selectedLanguages.length === 0) {
    alert('Please select at least one language.');
    return;
  }

  // Get the API key and set the model to 'gpt-4o'
  const apiKey = apiKeyInput.value.trim();
  const model = 'gpt-4o'; // Fixed to 'gpt-4o'

  if (!apiKey) {
    alert('Please enter your OpenAI API key.');
    return;
  }

  // Prompt the user to select the directory to save SRT files
  const saveDirectory = await window.electronAPI.selectDirectory();
  if (!saveDirectory) {
    alert('Please select a directory to save the SRT files.');
    return;
  }

  // Disable the start button to prevent multiple clicks
  startBtn.disabled = true;
  startBtn.textContent = 'Processing...';

  // Reset timer and progress
  timerDisplay.textContent = '00:00:00';
  progressBarFill.style.width = '0%';
  statusMessage.textContent = '';
  detectedLanguageDiv.textContent = 'Not yet detected';
  milestonesCompleted = 0;
  startTime = Date.now();

  // Start timer interval
  timerInterval = setInterval(() => {
    const elapsedTime = Date.now() - startTime;
    timerDisplay.textContent = formatTime(elapsedTime);
  }, 1000);

  try {
    const processingResult = await window.electronAPI.startProcessing(
      selectedVideoPath,
      selectedLanguages,
      apiKey,
      model,
      saveDirectory
    );

    // Update Detected Language
    const detectedLanguageCode = processingResult.detectedLanguage;
    const detectedLanguageName = getLanguageName(detectedLanguageCode);
    detectedLanguageDiv.textContent = detectedLanguageName;

    // Clear the API key from the input field
    apiKeyInput.value = '';
    apiKeyVisible = false;
    apiKeyInput.type = 'password';
    // Reset the eye icon
    eyeIcon.innerHTML = `<path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7
      -1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />`;

    // Stop timer
    clearInterval(timerInterval);

    // Display total tokens used
    const { tokensUsed, inputTokens, outputTokens, apiCalls } = processingResult;

    // Validate that all properties are defined
    if (
      tokensUsed !== undefined &&
      inputTokens !== undefined &&
      outputTokens !== undefined &&
      apiCalls !== undefined
    ) {
      alert(
        `Processing completed in ${timerDisplay.textContent}.\nDetected Language: ${detectedLanguageName}\nTotal API calls: ${apiCalls}\nTotal input tokens: ${inputTokens}\nTotal output tokens: ${outputTokens}\nTotal tokens used: ${tokensUsed}`
      );
    } else {
      alert('Processing completed, but some token counts are undefined. Please check the console for details.');
      console.error('Incomplete processingResult:', processingResult);
    }
  } catch (error) {
    alert('An error occurred during processing. Please check the console for details.');
    console.error(error);
    clearInterval(timerInterval);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'Start Processing';
  }
});

/**
 * Formats milliseconds into HH:MM:SS.
 *
 * @param {number} milliseconds - Time in milliseconds.
 * @returns {string} - Formatted time string.
 */
function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Updates the progress bar and status message.
 *
 * @param {string} milestoneMessage - Message describing the current milestone.
 */
function updateProgress(milestoneMessage) {
  milestonesCompleted += 1;
  const progressPercentage = (milestonesCompleted / totalMilestones) * 100;
  progressBarFill.style.width = `${progressPercentage}%`;
  statusMessage.textContent = milestoneMessage;
}

/**
 * Maps language codes to their respective language names.
 *
 * @param {string} code - ISO 639-1 language code.
 * @returns {string} - Full language name.
 */
function getLanguageName(code) {
  const languages = {
    en: 'English',
    ja: 'Japanese',
    es: 'Spanish',
    fr: 'French',
    // Add more languages as needed
  };
  return languages[code] || code;
}

// Listen for progress updates from the main process
window.electronAPI.onProgressUpdate((message) => {
  updateProgress(message);
});


