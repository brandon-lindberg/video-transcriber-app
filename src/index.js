// src/index.js

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('./transcribe');
const { translateSubtitles } = require('./translate');

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
      // Check if the file exists
      if (!fs.existsSync(videoPath)) {
        return reject('Video file not found at the specified path.');
      }

      // Use FFmpeg to extract audio from the video file
      ffmpeg(videoPath)
        .format('mp3') // Convert to MP3 audio format
        .on('start', function (commandLine) {
          console.log('Spawned FFmpeg with command: ' + commandLine);
        })
        .on('codecData', function (data) {
          console.log('Input is ' + data.audio + ' audio with ' + data.video + ' video');
        })
        .on('progress', function (progress) {
          if (progress.percent) {
            console.log('Processing: ' + progress.percent.toFixed(2) + '% done');
          }
        })
        .on('error', function (err, stdout, stderr) {
          console.log('An error occurred: ' + err.message);
          console.log('FFmpeg stderr: ' + stderr);
          reject(err);
        })
        .on('end', async function () {
          console.log('Audio extraction finished!');
          progressCallback('Audio extraction completed.');

          try {
            // Transcribe the extracted audio
            const transcriptionResult = await transcribeAudio('output_audio.mp3', apiKey);

            if (transcriptionResult && transcriptionResult.transcriptionData) {
              progressCallback('Transcription successful.');

              // Generate the original SRT file from the transcription data
              generateSRT(transcriptionResult.transcriptionData, path.join(saveDirectory, 'subtitles.srt'));
              progressCallback('SRT file generated.');

              // Initialize token and API call counters
              let totalTokens = transcriptionResult.tokensUsed;
              let totalInputTokens = transcriptionResult.inputTokens;
              let totalOutputTokens = transcriptionResult.outputTokens;
              let totalAPICalls = transcriptionResult.apiCalls;

              // Translate the subtitles into the selected target languages
              for (const lang of targetLanguages) {
                progressCallback(`Translating subtitles to ${lang.toUpperCase()}...`);

                const translationResult = await translateSubtitles(
                  path.join(saveDirectory, 'subtitles.srt'),
                  lang,
                  apiKey,
                  model,
                  saveDirectory
                );

                if (translationResult) {
                  // Accumulate tokens and API calls
                  totalTokens += translationResult.tokensUsed;
                  totalInputTokens += translationResult.inputTokens;
                  totalOutputTokens += translationResult.outputTokens;
                  totalAPICalls += translationResult.apiCalls;

                  progressCallback(`SRT file generated for ${lang.toUpperCase()}.`);
                } else {
                  progressCallback(`Failed to translate to ${lang.toUpperCase()}.`);
                  console.warn(`Translation result for ${lang} is undefined.`);
                }
              }

              // Clean up temporary audio file
              fs.unlinkSync('output_audio.mp3');
              console.log('Temporary audio file deleted.');

              // Resolve with the accumulated token and API call data
              resolve({
                tokensUsed: totalTokens,
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                apiCalls: totalAPICalls,
              });
            } else {
              reject('Transcription failed.');
            }
          } catch (error) {
            console.error('Error during transcription or translation:', error);
            reject(error);
          }
        })
        .save('output_audio.mp3'); // Save the extracted audio to a file
    } catch (error) {
      console.error('Error in processVideo:', error);
      reject(error);
    }
  });
}

// Function to generate SRT file from transcription data
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

// Helper function to convert seconds to SRT time format
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

module.exports = { processVideo };

