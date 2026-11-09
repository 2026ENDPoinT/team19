# Fixture integrity checker, not the production contract validator.
# BE/Codex, 2026-11-08. Windows PowerShell 5.1+, no external dependencies.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Check($condition, $message) {
    if (-not $condition) { throw "Validation failed: $message" }
}
function Has($object, $name) { return $null -ne $object.PSObject.Properties[$name] }
function Check-Error($value) {
    Check ($null -ne $value) 'missing error'
    Check (($value.code -is [string]) -and $value.code.Length -gt 0) 'error code'
    Check (($value.message -is [string]) -and $value.message.Length -gt 0) 'error message'
    Check ($value.retryable -is [bool]) 'error retryable'
}
function Rect($values) {
    Check ($values.Count -eq 4) 'rectangle length'
    foreach ($v in $values) { Check (([double]$v -ge 0) -and ([double]$v -le 1)) 'rectangle finite/range' }
    Check (($values[2] -gt 0) -and ($values[3] -gt 0) -and ($values[0]+$values[2] -le 1.000001) -and ($values[1]+$values[3] -le 1.000001)) 'rectangle bounds'
}
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot manifest.json) | ConvertFrom-Json
$data = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot cases.json) | ConvertFrom-Json
Check ($data.notice.Length -gt 0 -and $manifest.notice.Length -gt 0) 'fixture notices'
$byName = @{}
$jobIds = @{}
$jobsById = @{}
$clips = @{}
$plans = @{}
$outlines = @{}
$lectures = @{}
$results = @{}
$jobStates = @{}
$clipStates = @{}
$assetMap = @{}
foreach ($asset in $manifest.assets) {
    Check (-not $assetMap.ContainsKey($asset.url)) 'duplicate asset URL'
    Check ($asset.synthetic -eq $true) 'synthetic media marker'
    Check (Test-Path (Join-Path $PSScriptRoot $asset.file)) "missing asset $($asset.file)"
    $assetMap[$asset.url] = $asset
}
foreach ($case in $data.cases) {
    Check (-not $byName.ContainsKey($case.name)) "duplicate case $($case.name)"
    $byName[$case.name] = $case
    Check ($case.request.method -in @('GET','POST')) 'request method'
    Check ($case.request.path.StartsWith('/')) 'request path'
    if ($case.request.method -eq 'GET') { Check (-not (Has $case.request body)) 'GET body' }
    $body = $case.response.body
    $http = $case.response.status
    if ($http -ge 400) { Check-Error $body.error; continue }
    Check ($http -in @(200,202)) 'success HTTP status'
    if ($case.request.method -eq 'POST') {
        Check ($body.status -in @('pending','running','completed')) 'accept/reuse state'
        if ($http -eq 202) { Check ($body.status -in @('pending','running')) '202 state' }
        continue
    }
    Check ($body.id -is [string]) 'resource ID type'
    if ($case.request.path -like '/jobs/*') {
        Check ($case.request.path -eq "/jobs/$($body.id)") 'job path ID'
        Check ($body.status -in @('pending','running','completed','failed')) 'job state'
        Check ($null -eq $body.progress) 'unknown progress must be null'
        Check ($body.stage.Length -gt 0) 'job stage'
        if ($body.status -eq 'failed') { Check-Error $body.error } else { Check ($null -eq $body.error) 'job unexpected error' }
        $jobStates[$body.status] = $true
        if (-not $jobsById.ContainsKey($body.id)) { $jobsById[$body.id] = @() }
        $jobsById[$body.id] += $body
        if ($jobIds.ContainsKey($body.id)) { Check ($jobIds[$body.id] -eq $body.type) 'job type changed' }
        $jobIds[$body.id] = $body.type
    } elseif ($case.request.path -like '/clips/*') {
        Check ($case.request.path -eq "/clips/$($body.id)") 'clip path ID'
        Check ($body.status -in @('pending','running','completed','failed')) 'clip state'
        $clipStates[$body.status] = $true
        if ($clips.ContainsKey($body.id)) { Check ($clips[$body.id] -eq $body.planId) 'clip plan changed' }
        $clips[$body.id] = $body.planId
        if ($body.status -eq 'failed') { Check-Error $body.error } else { Check ($null -eq $body.error) 'clip unexpected error' }
        if ($body.status -ne 'completed') { Check ($null -eq $body.result) 'unfinished result'; continue }
        $result = $body.result
        Check (-not $results.ContainsKey($result.resultId)) 'duplicate result ID'
        $results[$result.resultId] = $body.id
        Check ($assetMap.ContainsKey($result.audioUrl)) 'audio URL mapping'
        Check ($result.durationSec -gt 0) 'duration'
        $sourcePath = Join-Path $PSScriptRoot $manifest.blueprintSource
        $original = Get-Content -Raw -Encoding UTF8 $sourcePath | ConvertFrom-Json
        Check ((Get-FileHash $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $manifest.blueprintSha256) 'blueprint source changed'
        Check (($original | ConvertTo-Json -Depth 100 -Compress) -ceq ($result.blueprint | ConvertTo-Json -Depth 100 -Compress)) 'blueprint must match AI sample unchanged'
        $sceneIds = @{}
        $componentIds = @{}
        $known = @{}
        $expected = @()
        foreach ($scene in $result.blueprint.scenes) {
            Check (-not $sceneIds.ContainsKey($scene.id)) 'duplicate scene ID'
            $sceneIds[$scene.id] = $true
            if ($scene.clear) { $known = @{} }
            foreach ($key in @('texts','slides','diagrams','grids','codes','actions','sourcePages')) {
                Check ((Has $scene $key) -and ($scene.$key -is [array])) "scene array $key"
            }
            foreach ($page in $scene.sourcePages) { Check (($page -is [int]) -and ($page -ge 1) -and ($page -le 57) -and $assetMap.ContainsKey("/assets/img_$page")) 'source page reference' }
            foreach ($kind in @('texts','slides','diagrams','grids','codes')) {
                foreach ($part in $scene.$kind) {
                    $items = @($part)
                    if ($kind -eq 'diagrams') {
                        $nodes = @($part.nodes | ForEach-Object { $_.id })
                        foreach ($edge in $part.edges) { Check (($edge.from -in $nodes) -and ($edge.to -in $nodes)) 'diagram edge reference' }
                        $items += @($part.nodes) + @($part.edges)
                    }
                    if ($kind -eq 'grids') { $items += @($part.pointers) }
                    foreach ($item in $items) {
                        Check (-not $componentIds.ContainsKey($item.id)) 'duplicate component ID'
                        $componentIds[$item.id] = $true; $known[$item.id] = $true
                    }
                    if ($kind -eq 'slides') { Check ($part.page -in $scene.sourcePages) 'slide page'; Rect $part.box }
                }
            }
            $lastLine = -1
            foreach ($action in $scene.actions) {
                Check ($known.ContainsKey($action.target)) 'action target after clear'
                Check (($action.line -is [int]) -and ($action.line -ge $lastLine) -and ($action.line -lt $scene.lines.Count)) 'action line/order'
                Check ($action.do -in @('show','hide','highlight','unhighlight','move','swap','setValue','setText','focus','markLine')) 'action type'
                $lastLine = $action.line
                if ($action.do -eq 'focus') { Rect @($action.args[0].Split(',') | ForEach-Object { [double]::Parse($_,[Globalization.CultureInfo]::InvariantCulture) }) }
            }
            for ($i=0; $i -lt $scene.lines.Count; $i++) { $expected += @{sceneId=$scene.id; lineIndex=$i; text=$scene.lines[$i]} }
        }
        Check ($expected.Count -eq $result.captions.Count) 'caption coverage'
        $end = 0.0
        for ($i=0; $i -lt $expected.Count; $i++) {
            $caption = $result.captions[$i]; $line = $expected[$i]
            Check (($caption.sceneId -ceq $line.sceneId) -and ($caption.lineIndex -eq $line.lineIndex) -and ($caption.text -ceq $line.text)) 'caption scene/line/text reference'
            Check (($caption.startSec -ge $end) -and ($caption.endSec -gt $caption.startSec) -and ($caption.endSec -le $result.durationSec)) 'caption order/duration'
            $end = $caption.endSec
        }
        $audio = $assetMap[$result.audioUrl]
        $bytes = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $audio.file))
        Check ([Text.Encoding]::ASCII.GetString($bytes,0,4) -eq 'RIFF') 'WAV RIFF'
        Check ([Text.Encoding]::ASCII.GetString($bytes,8,8) -eq 'WAVEfmt ') 'WAV format'
        Check ([BitConverter]::ToInt32($bytes,4) -eq $bytes.Length-8) 'WAV container size'
        Check ([BitConverter]::ToInt16($bytes,20) -eq 1 -and [BitConverter]::ToInt16($bytes,22) -eq 1 -and [BitConverter]::ToInt16($bytes,34) -eq 16) 'WAV PCM mono 16 bit'
        $wavDuration = [BitConverter]::ToInt32($bytes,40) / [double][BitConverter]::ToInt32($bytes,28)
        Check ([Math]::Abs($wavDuration-$result.durationSec) -lt 0.0001 -and $wavDuration -eq $audio.durationSec) 'WAV/result duration mismatch'
        Check ($audio.speech -eq $false) 'not speech marker'
    } elseif ($case.request.path -like '*/outlines/*') {
        Check ($case.request.path -eq "/lectures/lec_01/outlines/$($body.mode)") 'outline mode path'
        $outlines[$body.id] = $body.mode
        Check ($body.status -in @('planning','ready')) 'outline status'
        if ($body.status -eq 'planning') { Check ($body.clips.Count -eq 0) 'planning list' }
        $seen = @{}; $seenPlans = @{}
        for ($i=0; $i -lt $body.clips.Count; $i++) {
            $clip = $body.clips[$i]
            Check ($clip.order -eq $i) 'clip order'
            Check (-not $seen.ContainsKey($clip.id) -and -not $seenPlans.ContainsKey($clip.planId)) 'duplicate clip/plan'
            $seen[$clip.id] = $true; $seenPlans[$clip.planId] = $true
            if ($plans.ContainsKey($clip.id)) { Check ($plans[$clip.id] -eq $clip.planId) 'plan ID changed' }
            $plans[$clip.id] = $clip.planId
            Check ($clip.status -in @('pending','running','completed','failed')) 'outline clip state'
            if ($null -eq $clip.jobId) { Check ($clip.status -eq 'pending') 'unregistered state' }
            if ($clip.status -eq 'failed') { Check-Error $clip.error } else { Check ($null -eq $clip.error) 'outline unexpected error' }
            foreach ($page in $clip.sourcePages) { Check ($assetMap.ContainsKey("/assets/img_$page")) 'plan page mapping' }
        }
    } else {
        Check ($case.request.path -eq "/lectures/$($body.id)") 'lecture path ID'
        $lectures[$body.id] = $true
        if ($body.status -eq 'processing') { Check ($null -eq $body.pageCount -and $body.pages.Count -eq 0) 'processing pages' }
        foreach ($page in $body.pages) {
            Check ($page.number -ge 1 -and $page.number -le $body.pageCount -and $assetMap.ContainsKey($page.imageUrl)) 'lecture page mapping'
        }
    }
}
foreach ($case in $data.cases) {
    if ($case.response.status -ge 400) { continue }
    $body = $case.response.body
    foreach ($key in @('jobId','preparationJobId','retryOf')) {
        if ((Has $body $key) -and $null -ne $body.$key) { Check ($jobIds.ContainsKey($body.$key)) "missing job reference $($body.$key)" }
    }
    if (Has $body lectureId) {
        Check ($lectures.ContainsKey($body.lectureId) -or $body.lectureId -eq 'lec_bad') 'lecture reference'
    }
    if (Has $body outlineId) { Check ($outlines.ContainsKey($body.outlineId)) 'outline reference' }
    if (Has $body clips) {
        foreach ($clip in $body.clips) {
            if ($null -ne $clip.jobId) {
                Check ($jobIds.ContainsKey($clip.jobId) -and $jobIds[$clip.jobId] -eq 'generate_clip') 'plan job reference/type'
                Check ($clip.status -in @($jobsById[$clip.jobId] | ForEach-Object { $_.status })) 'clip/job state mismatch'
            }
        }
    }
}
foreach ($id in $clips.Keys) { Check ($plans.ContainsKey($id) -and $plans[$id] -eq $clips[$id]) 'clip/outline plan reference' }
foreach ($state in @('pending','running','completed','failed')) { Check ($jobStates.ContainsKey($state) -and $clipStates.ContainsKey($state)) "state coverage $state" }
foreach ($flow in $manifest.flows.PSObject.Properties) {
    $prior = @{}
    foreach ($name in $flow.Value) {
        Check ($byName.ContainsKey($name)) "flow case $name"
        $case = $byName[$name]
        if ($case.request.path -like '/jobs/*' -and $case.request.method -eq 'GET' -and $case.response.status -eq 200) {
            $job = $case.response.body
            if ($prior.ContainsKey($job.id)) {
                $allowed = @{pending=@('pending','running'); running=@('running','completed','failed'); completed=@('completed'); failed=@('failed')}
                Check ($job.status -in $allowed[$prior[$job.id]]) "job transition $($job.id)"
            }
            $prior[$job.id] = $job.status
        }
    }
}
$retry = $byName['retry.accepted'].response.body
Check ($retry.jobId -ne $retry.retryOf -and $byName['clip04.failed'].response.body.id -eq $retry.retryOf) 'retry lineage'
$a = $byName['outline.review.A.registered'].response.body.clips
$b = $byName['outline.review.B.registered'].response.body.clips
Check (@($a | Where-Object { $null -eq $_.jobId }).Count -eq 0) 'A job registration'
Check (@($b | Where-Object { $null -ne $_.jobId }).Count -eq 1) 'B job registration'
Add-Type -AssemblyName System.Drawing
foreach ($asset in $manifest.assets | Where-Object { $_.contentType -eq 'image/png' }) {
    $image = [Drawing.Image]::FromFile((Join-Path $PSScriptRoot $asset.file))
    try { Check ($image.Width -eq 960 -and $image.Height -eq 540) 'page image dimensions' } finally { $image.Dispose() }
}
Write-Output "PASS: $($data.cases.Count) cases, $($manifest.flows.PSObject.Properties.Name.Count) flows, $($manifest.assets.Count) media files; IDs, states, blueprint reuse, captions and WAV duration."
