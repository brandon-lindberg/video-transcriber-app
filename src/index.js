// src/index.js

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('./transcribe');
const { translateSubtitles } = require('./translate');

/**
 * Processes a video file by extracting audio, transcribing it, and translating subtitles.
 *
 * @param {string} videoPath - Path to the video file.
 * @param {Array<string>} targetLanguages - Array of target language codes.
 * @param {string} apiKey - OpenAI API key.
 * @param {string} model - OpenAI model name.
 * @param {string} saveDirectory - Directory to save SRT files.
 * @param {function} progressCallback - Callback to update progress.
 * @returns {object} - Aggregated token usage and API call counts.
 */
async function processVideo(
  videoPath,
  targetLanguages,
  apiKey,
  model,
  saveDirectory,
  progressCallback
) {
  return new Promise((resolve, reject) => {
    try {
      // Verify video file exists
      if (!fs.existsSync(videoPath)) {
        return reject('Video file not found at the specified path.');
      }

      // Extract audio using FFmpeg
      ffmpeg(videoPath)
        .format('mp3') // Convert to MP3
        .on('start', function (commandLine) {
          console.log('FFmpeg command:', commandLine);
        })
        .on('codecData', function (data) {
          console.log('Audio codec:', data.audio);
        })
        .on('progress', function (progress) {
          if (progress.percent) {
            console.log(`Processing: ${progress.percent.toFixed(2)}% done`);
          }
        })
        .on('error', function (err, stdout, stderr) {
          console.error('FFmpeg error:', err.message);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .on('end', async function () {
          console.log('Audio extraction completed.');
          progressCallback('Audio extraction completed.');

          try {
            // Transcribe the extracted audio
            const transcriptionResult = await transcribeAudio('output_audio.mp3', apiKey);

            if (transcriptionResult && transcriptionResult.transcriptionData) {
              progressCallback('Transcription successful.');

              // Get detected language
              const detectedLanguage = transcriptionResult.transcriptionData.language;
              console.log(`Detected Language: ${detectedLanguage} (${getLanguageName(detectedLanguage)})`);

              // Generate original SRT file
              const originalSrtPath = path.join(saveDirectory, 'subtitles_original.srt');
              generateSRT(transcriptionResult.transcriptionData, originalSrtPath);
              progressCallback('Original SRT file generated.');

              // Initialize counters
              let totalTokens = transcriptionResult.tokensUsed;
              let totalInputTokens = transcriptionResult.inputTokens;
              let totalOutputTokens = transcriptionResult.outputTokens;
              let totalAPICalls = transcriptionResult.apiCalls;

              // Translate subtitles to each target language
              for (const lang of targetLanguages) {
                progressCallback(`Translating subtitles to ${getLanguageName(lang)}...`);

                const translationResult = await translateSubtitles(
                  originalSrtPath,
                  detectedLanguage, // Pass detected language as source
                  lang,
                  apiKey,
                  model,
                  saveDirectory
                );

                if (translationResult) {
                  // Accumulate token usage and API calls
                  totalTokens += translationResult.tokensUsed;
                  totalInputTokens += translationResult.inputTokens;
                  totalOutputTokens += translationResult.outputTokens;
                  totalAPICalls += translationResult.apiCalls;

                  progressCallback(`SRT file generated for ${getLanguageName(lang)}.`);
                } else {
                  progressCallback(`Failed to translate to ${getLanguageName(lang)}.`);
                  console.warn(`Translation result for ${lang} is undefined.`);
                }
              }

              // Clean up temporary audio file
              fs.unlinkSync('output_audio.mp3');
              console.log('Temporary audio file deleted.');

              // Resolve with aggregated data
              resolve({
                tokensUsed: totalTokens,
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                apiCalls: totalAPICalls,
                detectedLanguage: detectedLanguage, // Include detected language
              });
            } else {
              reject('Transcription failed.');
            }
          } catch (error) {
            console.error('Error during transcription or translation:', error);
            reject(error);
          }
        })
        .save('output_audio.mp3'); // Save extracted audio
    } catch (error) {
      console.error('Error in processVideo:', error);
      reject(error);
    }
  });
}

/**
 * Generates an SRT file from transcription data.
 *
 * @param {object} transcriptionData - Data returned from the transcription API.
 * @param {string} outputFilePath - Path to save the generated SRT file.
 */
function generateSRT(transcriptionData, outputFilePath) {
  if (!transcriptionData.segments) {
    console.error('No segments found in transcription data.');
    return;
  }

  const srtEntries = transcriptionData.segments.map((segment, index) => {
    const id = index + 1;
    const startTime = secondsToSRTTime(segment.start);
    const endTime = secondsToSRTTime(segment.end);
    const text = segment.text.trim();

    return `${id}\n${startTime} --> ${endTime}\n${text}\n`;
  });

  const srtContent = srtEntries.join('\n');

  fs.writeFileSync(outputFilePath, srtContent);
  console.log(`SRT file generated: ${outputFilePath}`);
}

/**
 * Converts seconds to SRT time format (HH:MM:SS,mmm).
 *
 * @param {number} totalSeconds - Total seconds.
 * @returns {string} - Formatted time string.
 */
function secondsToSRTTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  const milliseconds = ((totalSeconds % 1) * 1000).toFixed(0).padStart(3, '0');

  return `${hours}:${minutes}:${seconds},${milliseconds}`;
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

module.exports = { processVideo };

