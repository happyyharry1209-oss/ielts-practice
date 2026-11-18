# Generate the MP3 assets for the short listening practices using Windows SAPI.
# From the repo root: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/generate-listening-drill-audio.ps1
param([ValidateRange(2, 100)][int] $First = 2, [ValidateRange(2, 100)][int] $Last = 100)

$ErrorActionPreference = 'Stop'
if ($Last -lt $First) { throw 'Last must be greater than or equal to First.' }
Add-Type -AssemblyName System.Speech

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$workDir = Join-Path $root ('.audio-tmp/drills-' + [guid]::NewGuid().ToString('N'))
$wavDir = Join-Path $workDir 'wav'
$mp3Dir = Join-Path $workDir 'mp3'
New-Item -ItemType Directory -Path $wavDir, $mp3Dir -Force | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)
$englishVoice = $synth.GetInstalledVoices() | Where-Object {
  $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'en'
} | Select-Object -First 1

try {
  if (-not $englishVoice) { throw 'Install an English Windows speech voice before generating audio.' }
  $synth.SelectVoice($englishVoice.VoiceInfo.Name)
  foreach ($number in ($First..$Last)) {
    $id = 'listening-{0:000}' -f $number
    $testPath = Join-Path $root "content/listening/$id.json"
    $test = Get-Content -LiteralPath $testPath -Encoding UTF8 -Raw | ConvertFrom-Json
    $turns = $test.sections[0].transcript -split "\r?\n\r?\n"
    $speakers = @{}
    $parts = foreach ($turn in $turns) {
      $speaker, $text = $turn -split ': ', 2
      if (-not $speakers.ContainsKey($speaker)) { $speakers[$speaker] = $speakers.Count }
      $escaped = [System.Security.SecurityElement]::Escape($text)
      $rate = if ($speakers[$speaker] % 2 -eq 0) { '94%' } else { '101%' }
      $pitch = if ($speakers[$speaker] % 2 -eq 0) { '+1st' } else { '-2st' }
      '<prosody rate="{0}" pitch="{1}">{2}</prosody><break time="550ms"/>' -f $rate, $pitch, $escaped
    }
    $culture = $englishVoice.VoiceInfo.Culture.Name
    $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{0}">{1}</speak>' -f $culture, ($parts -join '')
    $synth.SetOutputToWaveFile((Join-Path $wavDir "$id.wav"), $format)
    try { $synth.SpeakSsml($ssml) }
    finally { $synth.SetOutputToNull() }
  }
}
finally { $synth.Dispose() }

node (Join-Path $PSScriptRoot 'wav-to-mp3.mjs') $wavDir $mp3Dir 32
if ($LASTEXITCODE -ne 0) { throw 'MP3 conversion failed.' }

foreach ($number in ($First..$Last)) {
  $id = 'listening-{0:000}' -f $number
  $outputDir = Join-Path $root "apps/web/public/audio/$id"
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $mp3Dir "$id.mp3") -Destination (Join-Path $outputDir 'section1.mp3')
}
