// renderer.js

const selectFileBtn = document.getElementById('selectFileBtn');
const selectedFileSpan = document.getElementById('selectedFile');
const startBtn = document.getElementById('startBtn');
const languageOptionsDiv = document.getElementById('languageOptions');
const downloadLinksDiv = document.getElementById('downloadLinks');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelSelect = document.getElementById('modelSelect');
const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');
const eyeIcon = document.getElementById('eyeIcon');

let selectedVideoPath = null;
let apiKeyVisible = false;

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

// Handle API key input blur event
apiKeyInput.addEventListener('blur', async () => {
  const apiKey = apiKeyInput.value.trim();

  if (apiKey) {
    try {
      // Fetch available models
      const models = await window.electronAPI.fetchModels(apiKey);

      // Check if models are returned
      if (models && models.length > 0) {
        // Update the model dropdown
        updateModelDropdown(models);
      } else {
        alert('No models available with this API key.');
        modelSelect.innerHTML = '';
      }
    } catch (error) {
      alert('Error fetching models. Please check your API key.');
      console.error(error);
      modelSelect.innerHTML = '';
    }
  } else {
    // Clear the model dropdown if API key is removed
    modelSelect.innerHTML = '';
  }
});

// Function to update the model dropdown
function updateModelDropdown(models) {
  // Clear existing options
  modelSelect.innerHTML = '';

  // Filter models to include only relevant ones (e.g., models starting with 'gpt-')
  const relevantModels = models.filter((model) => model.id.startsWith('gpt-'));

  if (relevantModels.length === 0) {
    alert('No GPT models available with this API key.');
    return;
  }

  // Sort models alphabetically
  relevantModels.sort((a, b) => a.id.localeCompare(b.id));

  // Populate the dropdown
  relevantModels.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.id;
    modelSelect.appendChild(option);
  });
}

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

  // Get the API key and selected model
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;

  if (!apiKey) {
    alert('Please enter your OpenAI API key.');
    return;
  }

  if (!model) {
    alert('Please select a model.');
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

  try {
    await window.electronAPI.startProcessing(
      selectedVideoPath,
      selectedLanguages,
      apiKey,
      model,
      saveDirectory
    );

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

    // Clear the model dropdown
    modelSelect.innerHTML = '';

    // Notify the user that files have been saved
    alert(`Processing completed. SRT files have been saved to: ${saveDirectory}`);
  } catch (error) {
    alert('An error occurred during processing. Please check the console for details.');
    console.error(error);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'Start Processing';
  }
});
