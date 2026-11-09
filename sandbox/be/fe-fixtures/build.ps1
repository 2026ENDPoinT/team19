# Development fixtures only; BE/Codex, 2026-11-08. No AI/network calls.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Save-Json($name, $value) {
    [IO.File]::WriteAllText((Join-Path $root $name), ($value | ConvertTo-Json -Depth 100) + "`n", $utf8)
}
function Copy-Value($value) { return ($value | ConvertTo-Json -Depth 100 | ConvertFrom-Json) }
$source = '../../ai/blueprint_v0/sample1_concept_quicksort.json'
$sourcePath = Join-Path $root $source
$blueprint = Get-Content -Raw -Encoding UTF8 $sourcePath | ConvertFrom-Json
$cases = New-Object System.Collections.Generic.List[object]
function Case($name, $method, $path, $status, $body, $requestBody = $null) {
    $request = [ordered]@{method=$method; path=$path}
    if ($null -ne $requestBody) { $request.body = $requestBody }
    $cases.Add([ordered]@{name=$name; request=$request; response=[ordered]@{status=$status; body=$body}})
}
function Fault($code, $message, $retryable) {
    return [ordered]@{code=$code; message=$message; retryable=$retryable}
}
function Job($name, $id, $type, $status, $stage, $errorValue = $null) {
    Case $name GET "/jobs/$id" 200 ([ordered]@{id=$id; type=$type; status=$status; stage=$stage; progress=$null; error=$errorValue})
}
$audioError = Fault TTS_FAILED '테스트용 음성 생성 실패입니다. 다시 시도할 수 있습니다.' $true
$pdfError = Fault INVALID_PDF '분석 중 PDF 내용을 읽지 못한 상황을 재현합니다.' $false
Case upload.accepted POST /lectures 202 ([ordered]@{lectureId='lec_01'; jobId='job_01'; status='pending'})
Job prepare.pending job_01 prepare_lecture pending queued
Job prepare.running job_01 prepare_lecture running extracting
Case lecture.processing GET /lectures/lec_01 200 ([ordered]@{id='lec_01'; title='알고리즘 (개발용 샘플)'; status='processing'; pageCount=$null; preparationJobId='job_01'; pages=@()})
Job prepare.completed job_01 prepare_lecture completed done
$pages = @(31,32,33,52 | ForEach-Object { [ordered]@{number=$_; imageUrl="/assets/img_$_"} })
Case lecture.ready GET /lectures/lec_01 200 ([ordered]@{id='lec_01'; title='알고리즘 (개발용 샘플)'; status='ready'; pageCount=57; preparationJobId='job_01'; pages=$pages})
Case upload.bad.accepted POST /lectures 202 ([ordered]@{lectureId='lec_bad'; jobId='job_bad'; status='pending'})
Job prepare.bad.pending job_bad prepare_lecture pending queued
Job prepare.bad.running job_bad prepare_lecture running extracting
Job prepare.failed job_bad prepare_lecture failed extracting $pdfError
foreach ($mode in @('review','intro','exam')) {
    $suffix = if ($mode -eq 'review') { '02' } else { $mode }
    $outId = if ($mode -eq 'review') { 'out_01' } else { "out_$mode" }
    Case "outline.$mode.accepted" POST /lectures/lec_01/outlines 202 ([ordered]@{outlineId=$outId; jobId="job_$suffix"; status='pending'; reused=$false}) ([ordered]@{mode=$mode})
    Job "outline.$mode.pending" "job_$suffix" build_outline pending queued
    Job "outline.$mode.running" "job_$suffix" build_outline running planning
    Case "outline.$mode.planning" GET "/lectures/lec_01/outlines/$mode" 200 ([ordered]@{id=$outId; mode=$mode; status='planning'; jobId="job_$suffix"; clips=@()})
    Job "outline.$mode.completed" "job_$suffix" build_outline completed done
    if ($mode -ne 'review') {
        Case "outline.$mode.ready" GET "/lectures/lec_01/outlines/$mode" 200 ([ordered]@{id=$outId; mode=$mode; status='ready'; jobId="job_$suffix"; clips=@([ordered]@{id="clip_$mode"; planId="plan_$mode"; order=0; title=$blueprint.title; sourcePages=@(31,32,33,52); status='pending'; jobId=$null; error=$null})})
    }
}
Case outline.review.reused.running POST /lectures/lec_01/outlines 202 ([ordered]@{outlineId='out_01'; jobId='job_02'; status='running'; reused=$true}) @{mode='review'}
Case outline.review.reused.ready POST /lectures/lec_01/outlines 200 ([ordered]@{outlineId='out_01'; jobId='job_02'; status='completed'; reused=$true}) @{mode='review'}
function Plan($n, $status, $jobId, $errorValue = $null) {
    return [ordered]@{id=('clip_{0:00}' -f $n); planId=('plan_{0:00}' -f $n); order=($n-1); title=($(if($n -eq 1){$blueprint.title}else{"테스트 클립 $n"})); sourcePages=@(31,32,33,52); status=$status; jobId=$jobId; error=$errorValue}
}
function Outline($name, $plans) {
    Case $name GET /lectures/lec_01/outlines/review 200 ([ordered]@{id='out_01'; mode='review'; status='ready'; jobId='job_02'; clips=@($plans)})
}
Outline outline.review.A.registered @(1..5 | ForEach-Object { Plan $_ pending ('job_{0:00}' -f ($_+2)) })
Outline outline.review.B.registered @(1..5 | ForEach-Object { Plan $_ pending $(if($_ -eq 1){'job_03'}else{$null}) })
Outline outline.review.mixed @((Plan 1 completed job_03), (Plan 2 running job_04), (Plan 3 pending job_05), (Plan 4 failed job_06 $audioError), (Plan 5 pending $null))
Job clip01.pending job_03 generate_clip pending queued
Job clip01.running job_03 generate_clip running blueprint
Job clip01.completed job_03 generate_clip completed done
Job clip02.pending job_04 generate_clip pending queued
Job clip02.running job_04 generate_clip running audio
Job clip03.pending job_05 generate_clip pending queued
Job clip04.pending job_06 generate_clip pending queued
Job clip04.running job_06 generate_clip running audio
Job clip04.failed job_06 generate_clip failed audio $audioError
Job clip05.pending job_07 generate_clip pending queued
function Clip($name, $n, $status, $errorValue = $null, $resultValue = $null) {
    Case $name GET ('/clips/clip_{0:00}' -f $n) 200 ([ordered]@{id=('clip_{0:00}' -f $n); planId=('plan_{0:00}' -f $n); status=$status; error=$errorValue; result=$resultValue})
}
Clip clip.pending 3 pending
Clip clip.unregistered 5 pending
Clip clip.running 2 running
Clip clip.failed 4 failed $audioError
$captions = @()
$clock = 0.0
foreach ($scene in $blueprint.scenes) {
    for ($line = 0; $line -lt $scene.lines.Count; $line++) {
        $captions += [ordered]@{sceneId=$scene.id; lineIndex=$line; text=$scene.lines[$line]; startSec=$clock; endSec=($clock+3.0)}
        $clock += 3.25
    }
}
$duration = $clock - 0.25
Clip clip.completed 1 completed $null ([ordered]@{resultId='res_01'; durationSec=$duration; audioUrl='/assets/audio_01'; blueprint=$blueprint; captions=$captions})
Case retry.accepted POST /jobs/job_06/retry 202 ([ordered]@{jobId='job_08'; retryOf='job_06'; status='pending'}) @{}
Job retry.pending job_08 generate_clip pending queued
Job retry.running job_08 generate_clip running audio
Job retry.failed job_08 generate_clip failed audio $audioError
Outline outline.review.retrying @((Plan 1 completed job_03), (Plan 2 running job_04), (Plan 3 pending job_05), (Plan 4 running job_08), (Plan 5 pending $null))
Job restart.failed job_04 generate_clip failed audio (Fault SERVER_RESTARTED '서버 재시작으로 중단된 테스트 작업입니다.' $true)
$errors = @(
    @('upload.too-large','POST','/lectures',413,'FILE_TOO_LARGE'),
    @('upload.unsupported','POST','/lectures',415,'UNSUPPORTED_FILE_TYPE'),
    @('upload.invalid','POST','/lectures',422,'INVALID_PDF'),
    @('upload.storage','POST','/lectures',503,'STORAGE_UNAVAILABLE'),
    @('outline.not-ready','POST','/lectures/lec_01/outlines',409,'LECTURE_NOT_READY'),
    @('outline.invalid-mode','POST','/lectures/lec_01/outlines',422,'INVALID_MODE'),
    @('lecture.not-found','GET','/lectures/missing',404,'LECTURE_NOT_FOUND'),
    @('outline.not-found','GET','/lectures/lec_01/outlines/review',404,'OUTLINE_NOT_FOUND'),
    @('clip.not-found','GET','/clips/missing',404,'CLIP_NOT_FOUND'),
    @('job.not-found','GET','/jobs/missing',404,'JOB_NOT_FOUND'),
    @('asset.not-found','GET','/assets/missing',404,'ASSET_NOT_FOUND'),
    @('retry.not-found','POST','/jobs/missing/retry',404,'JOB_NOT_FOUND'),
    @('retry.conflict','POST','/jobs/job_06/retry',409,'RETRY_NOT_ALLOWED')
)
foreach ($entry in $errors) {
    $requestBody = switch ($entry[0]) {
        'outline.invalid-mode' { @{mode='unknown'} }
        'outline.not-ready' { @{mode='review'} }
        'retry.not-found' { @{} }
        'retry.conflict' { @{} }
        default { $null }
    }
    Case $entry[0] $entry[1] $entry[2] $entry[3] @{error=(Fault $entry[4] '개발용 요청 오류 샘플입니다.' ($entry[3] -eq 503))} $requestBody
}
# Every response is a fixture. Keep warnings out of proposed HTTP bodies.
Save-Json cases.json ([ordered]@{notice='BE/Codex 개발용 수작업 샘플. 실제 AI 결과 아님. 최종 계약 전이며 서버 응답 보장 아님.'; cases=@($cases.ToArray())})

# Offline test media: four labelled synthetic pages and a PCM tone, not speech.
Add-Type -AssemblyName System.Drawing
$media = Join-Path $root media
[IO.Directory]::CreateDirectory($media) | Out-Null
$assets = @()
foreach ($page in @(31,32,33,52)) {
    $bitmap = New-Object Drawing.Bitmap(960,540)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $font = New-Object Drawing.Font('Arial',24)
    $pen = New-Object Drawing.Pen([Drawing.Color]::SteelBlue,3)
    try {
        $graphics.Clear([Drawing.Color]::White)
        $graphics.DrawString("SYNTHETIC TEST PAGE $page - NOT ORIGINAL PDF",$font,[Drawing.Brushes]::Black,25,25)
        $graphics.DrawString('BE/Codex | pre-contract fixture | no AI output',$font,[Drawing.Brushes]::Black,25,75)
        $graphics.DrawString('Small values       PIVOT       Large values',$font,[Drawing.Brushes]::Black,80,210)
        $graphics.DrawRectangle($pen,48,162,864,189)
        $graphics.DrawRectangle($pen,432,162,144,189)
        $graphics.DrawString('Crop / focus / page-panel layout testing only',$font,[Drawing.Brushes]::Black,25,440)
        $bitmap.Save((Join-Path $media "page-$page.png"),[Drawing.Imaging.ImageFormat]::Png)
    } finally { $pen.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
    $assets += [ordered]@{url="/assets/img_$page"; file="media/page-$page.png"; contentType='image/png'; synthetic=$true}
}
$audioPath = Join-Path $media 'test-tone.wav'
$rate = 16000
$frames = [int]($duration*$rate)
$stream = [IO.File]::Create($audioPath)
$writer = New-Object IO.BinaryWriter($stream)
try {
    $writer.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $writer.Write([int](36+$frames*2))
    $writer.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt ')); $writer.Write([int]16)
    $writer.Write([int16]1); $writer.Write([int16]1); $writer.Write([int]$rate)
    $writer.Write([int]($rate*2)); $writer.Write([int16]2); $writer.Write([int16]16)
    $writer.Write([Text.Encoding]::ASCII.GetBytes('data')); $writer.Write([int]($frames*2))
    for ($frame=0; $frame -lt $frames; $frame++) {
        $second = $frame / [double]$rate
        $inLine = $second % 3.25
        # Quiet 440 Hz signal during each caption; 0.25 s silence between lines.
        $sample = if ($inLine -lt 3.0) { [int16](900*[Math]::Sin(2*[Math]::PI*440*$second)*[Math]::Min(1,[Math]::Min($inLine*100,(3.0-$inLine)*100))) } else { [int16]0 }
        $writer.Write($sample)
    }
} finally { $writer.Dispose(); $stream.Dispose() }
$assets += [ordered]@{url='/assets/audio_01'; file='media/test-tone.wav'; contentType='audio/wav'; synthetic=$true; speech=$false; durationSec=$duration}
Save-Json manifest.json ([ordered]@{
    notice='최종 계약 전 BE/Codex 개발용 샘플. 모든 미디어·시간은 인공 생성, 실제 AI·TTS 결과 아님.'
    blueprintSource=$source
    blueprintSha256=(Get-FileHash $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    modeCandidates=@(@{value='review'; label='복습'},@{value='intro'; label='처음 보기'},@{value='exam'; label='시험 대비'})
    assets=$assets
    flows=[ordered]@{
        preparation=@('upload.accepted','prepare.pending','prepare.running','lecture.processing','prepare.completed','lecture.ready')
        invalidPdf=@('upload.bad.accepted','prepare.bad.pending','prepare.bad.running','prepare.failed')
        reviewPlanning=@('outline.review.accepted','outline.review.pending','outline.review.running','outline.review.planning','outline.review.completed')
        A=@('outline.review.A.registered')
        B=@('outline.review.B.registered')
        clipSuccess=@('clip01.pending','clip01.running','clip01.completed','clip.completed')
        mixed=@('outline.review.mixed','clip.pending','clip.unregistered','clip.running','clip.failed','clip.completed')
        retry=@('clip04.pending','clip04.running','clip04.failed','clip.failed','retry.accepted','retry.pending','retry.running','outline.review.retrying','retry.conflict','retry.failed','clip.failed')
        restart=@('clip02.pending','clip02.running','restart.failed')
    }
})
Write-Output "Built $($cases.Count) cases, $($assets.Count) assets, $duration seconds. No AI calls."
