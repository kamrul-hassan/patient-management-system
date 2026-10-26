#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectDirectory '.env'
$settings = @{}
foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$matches[1]] = $matches[2] }
}
$origin = $settings['APP_ORIGIN'].TrimEnd('/')
$originUri = [Uri]$origin
if ($originUri.Host -notin @('localhost', '127.0.0.1')) {
    throw 'This sample-data helper is restricted to the local application.'
}

$loginBody = @{ email = $settings['STAFF_EMAIL']; password = $settings['STAFF_PASSWORD'] } | ConvertTo-Json -Compress
$login = Invoke-WebRequest -Uri ($origin + '/api/auth') -Method POST -Headers @{ Origin = $origin } -ContentType 'application/json' -Body $loginBody -UseBasicParsing
$cookieHeader = [string]($login.Headers['Set-Cookie'] | Select-Object -First 1)
$sessionCookie = $cookieHeader.Split(';')[0]
if (!$sessionCookie.StartsWith('careflow-session=')) { throw 'Could not authenticate the configured staff account.' }
$requestHeaders = @{ Origin = $origin; Cookie = $sessionCookie }

function Invoke-ClinicApi {
    param([string]$Path, [string]$Method = 'GET', $Body = $null)
    $request = @{ Uri = ($origin + '/api/' + $Path); Method = $Method; Headers = $requestHeaders }
    if ($null -ne $Body) {
        $request.ContentType = 'application/json'
        $request.Body = $Body | ConvertTo-Json -Depth 6 -Compress
    }
    Invoke-RestMethod @request
}

try {
    $workspace = Invoke-ClinicApi 'workspace'
    if ($workspace.demo) { throw 'Use this helper against the PostgreSQL-backed app, not the in-memory demo.' }
    $originalIds = @{
        locations = @($workspace.locations | ForEach-Object { $_.id })
        patients = @($workspace.patients | ForEach-Object { $_.id })
        appointments = @($workspace.appointments | ForEach-Object { $_.id })
    }
    $addedPatients = 0
    $addedAppointments = 0
    $clinicName = 'Careflow Sample Clinic (Test Data)'
    $clinic = $workspace.locations | Where-Object { $_.name -eq $clinicName } | Select-Object -First 1
    if (!$clinic) {
        $clinic = Invoke-ClinicApi 'locations' 'POST' @{ name = $clinicName; address = 'Sample address, Dhaka - fictional test clinic' }
    }

    $names = @('Olivia Rhye', 'Phoenix Baker', 'Lana Steiner', 'Demi Wilkinson', 'Drew Cano', 'Natali Craig', 'Orlando Diggs', 'Andi Lane')
    $samplePatients = @()
    for ($index = 0; $index -lt $names.Count; $index++) {
        $email = 'careflow.sample.' + $names[$index].ToLowerInvariant().Replace(' ', '.') + '@example.com'
        $patient = $workspace.patients | Where-Object { $_.email -eq $email -and $_.locationId -eq $clinic.id } | Select-Object -First 1
        if (!$patient) {
            $patient = Invoke-ClinicApi 'patients' 'POST' @{
                name = $names[$index] + ' (Sample)'
                email = $email
                phone = ('+880 000 000 {0:D4}' -f ($index + 1))
                dateOfBirth = ('{0}-05-14' -f (1985 + $index))
                locationId = $clinic.id
                bloodGroup = @('O+', 'A+', 'B+', 'AB+')[$index % 4]
                allergies = 'Synthetic sample - none recorded'
            }
            $addedPatients++
        }
        $samplePatients += $patient
    }

    try { $zone = [TimeZoneInfo]::FindSystemTimeZoneById('Asia/Dhaka') }
    catch { $zone = [TimeZoneInfo]::FindSystemTimeZoneById('Bangladesh Standard Time') }
    $localNow = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $zone)
    $baseLocal = $localNow.Date.AddHours(9)
    while ($baseLocal -lt $localNow.AddMinutes(15)) { $baseLocal = $baseLocal.AddMinutes(45) }
    if ($baseLocal.Hour -ge 16) { $baseLocal = $localNow.Date.AddDays(1).AddHours(9) }
    $types = @('Consultation', 'Follow-up', 'Telemedicine', 'Check-up')
    $newAppointmentDates = @()
    for ($index = 0; $index -lt 12; $index++) {
        $reason = '[CAREFLOW SAMPLE] Appointment {0:D2} - fictional test visit' -f ($index + 1)
        $existing = $workspace.appointments | Where-Object { $_.reason -eq $reason -and $_.locationId -eq $clinic.id } | Select-Object -First 1
        if ($existing) { continue }
        $patient = $samplePatients[$index % $samplePatients.Count]
        $provider = $workspace.providers[$index % $workspace.providers.Count]
        $localStart = if ($index -lt 8) { $baseLocal.AddMinutes($index * 45) } else { $baseLocal.Date.AddDays(1).AddHours(9).AddMinutes(($index - 8) * 45) }
        if ($localStart.Hour -ge 18) { $localStart = $localStart.Date.AddDays(1).AddHours(9).AddMinutes(($index % 8) * 45) }
        $start = [TimeZoneInfo]::ConvertTimeToUtc([DateTime]::SpecifyKind($localStart, [DateTimeKind]::Unspecified), $zone)
        # Preserve existing schedules, including the same providers at other locations.
        do {
            $end = $start.AddMinutes(30)
            $conflicts = @($workspace.appointments | Where-Object {
                $_.status -ne 'Cancelled' -and ($_.provider -eq $provider -or $_.patientId -eq $patient.id) -and
                ([DateTime]$_.startsAt).ToUniversalTime() -lt $end -and
                ([DateTime]$_.startsAt).ToUniversalTime().AddMinutes($_.durationMinutes) -gt $start
            })
            if ($conflicts.Count -gt 0) { $start = $start.AddMinutes(45) }
        } while ($conflicts.Count -gt 0)
        $appointment = Invoke-ClinicApi 'appointments' 'POST' @{
            patientId = $patient.id; locationId = $clinic.id; provider = $provider
            type = $types[$index % $types.Count]; startsAt = $start.ToString('o')
            durationMinutes = 30; reason = $reason
        }
        $workspace.appointments = @($workspace.appointments) + @($appointment)
        $addedAppointments++
        $newAppointmentDates += [TimeZoneInfo]::ConvertTimeFromUtc($start, $zone).ToString('yyyy-MM-dd')
        # Give new sample visits varied states to exercise the dashboard. Reruns do not reset them.
        $transitions = if ($index -lt 2) { @('Checked in', 'In progress', 'Completed') } elseif ($index -eq 2) { @('Checked in', 'In progress') } elseif ($index -eq 3) { @('Checked in') } else { @() }
        foreach ($status in $transitions) {
            $null = Invoke-ClinicApi ('appointments/' + $appointment.id) 'PATCH' @{ status = $status }
        }
    }
    $verified = Invoke-ClinicApi ('workspace?locationId=' + $clinic.id)
    $verifiedPatients = @($verified.patients | Where-Object { $_.email -like 'careflow.sample.*@example.com' })
    $verifiedAppointments = @($verified.appointments | Where-Object { $_.reason -like '[[]CAREFLOW SAMPLE[]]*' })
    if ($verifiedPatients.Count -lt 8 -or $verifiedAppointments.Count -lt 12) { throw 'Sample data verification failed.' }
    $after = Invoke-ClinicApi 'workspace'
    foreach ($collection in @('locations', 'patients', 'appointments')) {
        $afterIds = @($after.$collection | ForEach-Object { $_.id })
        foreach ($originalId in $originalIds[$collection]) {
            if ($originalId -notin $afterIds) { throw "An original $collection entry is missing." }
        }
    }
    Write-Output ('Sample clinic ready: {0}' -f $clinicName)
    Write-Output ('Verified {0} sample patients and {1} sample appointments in PostgreSQL.' -f $verifiedPatients.Count, $verifiedAppointments.Count)
    Write-Output ('Added this run: {0} patients, {1} appointments. Existing records preserved.' -f $addedPatients, $addedAppointments)
    if ($newAppointmentDates.Count -gt 0) { Write-Output ('Appointment dates (Asia/Dhaka): ' + (($newAppointmentDates | Sort-Object -Unique) -join ', ')) }
} finally {
    $null = Invoke-WebRequest -Uri ($origin + '/api/auth') -Method DELETE -Headers $requestHeaders -UseBasicParsing
}
