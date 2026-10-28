# Synthesise the demo Listening audio with Windows SAPI (no external tools),
# then compress the WAV files to MP3 with scripts/wav-to-mp3.mjs.
#
#   pwsh -File scripts/generate-audio.ps1
#
# Output: apps/web/public/audio/listening-001/section1..4.mp3

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$contentFile = Join-Path $root "content/listening/listening-001.json"
$tmpDir = Join-Path $root ".audio-tmp"
$outDir = Join-Path $root "apps/web/public/audio/listening-001"

New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$data = Get-Content $contentFile -Raw | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft Zira Desktop")
$synth.Rate = -1

$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)

function ConvertTo-Ssml([string] $transcript) {
  $turns = $transcript -split "`r?`n`r?`n" | Where-Object { $_.Trim() -ne "" }
  $parts = foreach ($turn in $turns) {
    $text = $turn.Trim() -replace '^[A-Z][A-Za-z .'']{0,30}:\s*', ''
    $text = $text -replace "`r?`n", ' '
    $escaped = [System.Security.SecurityElement]::Escape($text)
    "<s>$escaped</s><break time=`"750ms`"/>"
  }
  return @"
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
$($parts -join "`n")
</speak>
"@
}

$sections = $data.sections
for ($i = 0; $i -lt $sections.Count; $i++) {
  $number = $i + 1
  $wav = Join-Path $tmpDir "section$number.wav"
  $ssml = ConvertTo-Ssml $sections[$i].transcript
  Write-Host "Synthesising section $number ($($sections[$i].title))..."
  $synth.SetOutputToWaveFile($wav, $format)
  $synth.SpeakSsml($ssml)
  $synth.SetOutputToNull()
}

$synth.Dispose()
Write-Host "WAV files written to $tmpDir"

node (Join-Path $PSScriptRoot "wav-to-mp3.mjs") $tmpDir $outDir
if ($LASTEXITCODE -ne 0) { throw "MP3 conversion failed" }

Get-ChildItem $outDir -Filter *.mp3 | ForEach-Object {
  Write-Host ("  {0}  {1:N0} KB" -f $_.Name, ($_.Length / 1KB))
}
