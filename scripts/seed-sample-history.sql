-- Six calendar months of fictional analytics data, ending yesterday in Asia/Dhaka.
-- Insert-only: existing visits, payments, and patient details are never reset.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('careflow-sample-history-v1', 0));

DO $$
DECLARE
    sample_patient_count integer;
BEGIN
    SELECT count(*) INTO sample_patient_count
    FROM "Patients" p
    JOIN "Locations" l ON l."Id" = p."LocationId"
    WHERE l."Name" = 'Careflow Sample Clinic (Test Data)'
      AND p."Name" LIKE '% (Sample)'
      AND p."Email" ~ '^careflow\.sample\.[a-z.]+@example\.com$';
    IF sample_patient_count <> 8 THEN
        RAISE EXCEPTION 'Expected the eight explicitly labeled sample patients. No history was added.';
    END IF;
END $$;

CREATE TEMP TABLE careflow_sample_history_plan ON COMMIT DROP AS
WITH boundaries AS (
    SELECT (date_trunc('month', now() AT TIME ZONE 'Asia/Dhaka') - interval '5 months')::date AS first_day,
           (now() AT TIME ZONE 'Asia/Dhaka')::date - 1 AS last_day
), days AS (
    SELECT d::date AS visit_day,
           d::date - b.first_day AS day_index,
           ((extract(year FROM d)::integer - extract(year FROM b.first_day)::integer) * 12
              + extract(month FROM d)::integer - extract(month FROM b.first_day)::integer) AS month_index
    FROM boundaries b
    CROSS JOIN LATERAL generate_series(b.first_day::timestamp, b.last_day::timestamp, interval '1 day') d
    WHERE extract(isodow FROM d) NOT IN (5, 6)
), sample_patients AS (
    SELECT p."Id" AS patient_id, p."LocationId" AS location_id,
           row_number() OVER (ORDER BY p."Email") - 1 AS patient_index
    FROM "Patients" p
    JOIN "Locations" l ON l."Id" = p."LocationId"
    WHERE l."Name" = 'Careflow Sample Clinic (Test Data)'
      AND p."Name" LIKE '% (Sample)'
      AND p."Email" ~ '^careflow\.sample\.[a-z.]+@example\.com$'
), slots AS (
    SELECT d.*, s.slot
    FROM days d
    CROSS JOIN LATERAL generate_series(0, 2 + (d.month_index / 2) + (d.day_index % 2) - 1) s(slot)
)
SELECT p.patient_id, p.location_id, s.visit_day, s.slot,
       (ARRAY['Dr. Sarah Mitchell', 'Dr. James Chen', 'Dr. Emily Davis'])[(s.day_index + s.slot) % 3 + 1] AS provider,
       (ARRAY['Consultation', 'Follow-up', 'Telemedicine', 'Check-up'])[(s.day_index + s.slot) % 4 + 1] AS visit_type,
       (s.visit_day::timestamp + interval '9 hours' + s.slot * interval '45 minutes') AT TIME ZONE 'Asia/Dhaka' AS starts_at,
       CASE WHEN (s.day_index + s.slot) % 13 = 0 THEN 'Cancelled' ELSE 'Completed' END AS status,
       '[CAREFLOW SAMPLE HISTORY] ' || to_char(s.visit_day, 'YYYY-MM-DD') || ' visit '
           || lpad((s.slot + 1)::text, 2, '0') || ' - fictional appointment' AS reason,
       'SAMPLE-HIST-' || to_char(s.visit_day, 'YYYYMMDD') || '-' || lpad((s.slot + 1)::text, 2, '0') AS invoice_number,
       (90 + s.month_index * 12 + (s.slot % 4) * 15)::numeric(12,2) AS amount
FROM slots s
JOIN sample_patients p ON p.patient_index = (s.day_index + s.slot) % 8;

INSERT INTO "Appointments" ("Id", "PatientId", "LocationId", "Provider", "Type", "StartsAt", "DurationMinutes", "Status", "Reason")
SELECT gen_random_uuid(), h.patient_id, h.location_id, h.provider, h.visit_type, h.starts_at, 30, h.status, h.reason
FROM careflow_sample_history_plan h
WHERE NOT EXISTS (
    SELECT 1 FROM "Appointments" a
    WHERE a."LocationId" = h.location_id AND a."Reason" = h.reason
)
AND (h.status = 'Cancelled' OR NOT EXISTS (
    SELECT 1 FROM "Appointments" a
    WHERE a."Status" <> 'Cancelled'
      AND (a."Provider" = h.provider OR a."PatientId" = h.patient_id)
      AND a."StartsAt" < h.starts_at + interval '30 minutes'
      AND a."StartsAt" + a."DurationMinutes" * interval '1 minute' > h.starts_at
));

-- Only completed historical examples receive invoices. Payment dates stay in the visit month.
INSERT INTO "Invoices" ("Id", "PatientId", "LocationId", "Number", "Description", "Amount", "Status", "IssuedAt", "DueAt", "PaidAt")
SELECT gen_random_uuid(), h.patient_id, h.location_id, h.invoice_number,
       '[CAREFLOW SAMPLE HISTORY] ' || h.visit_type || ' on ' || to_char(h.visit_day, 'YYYY-MM-DD') || ' - fictional payment',
       h.amount, 'Paid', h.starts_at + interval '30 minutes',
       h.starts_at + interval '14 days', h.starts_at + interval '1 hour'
FROM careflow_sample_history_plan h
JOIN "Appointments" a ON a."LocationId" = h.location_id
    AND a."PatientId" = h.patient_id AND a."Reason" = h.reason AND a."Status" = 'Completed'
WHERE NOT EXISTS (SELECT 1 FROM "Invoices" i WHERE i."Number" = h.invoice_number)
ON CONFLICT ("Number") DO NOTHING;

-- Summary includes only this marker and the intended clinic, not other practice records.
SELECT to_char(a."StartsAt" AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM') AS month,
       count(*) AS appointments,
       count(*) FILTER (WHERE a."Status" = 'Completed') AS completed,
       count(*) FILTER (WHERE a."Status" = 'Cancelled') AS cancelled
FROM "Appointments" a
JOIN "Locations" l ON l."Id" = a."LocationId"
WHERE l."Name" = 'Careflow Sample Clinic (Test Data)'
  AND a."Reason" LIKE '[CAREFLOW SAMPLE HISTORY]%'
GROUP BY month ORDER BY month;

SELECT to_char(i."PaidAt" AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM') AS payment_month,
       count(*) AS paid_invoices, sum(i."Amount") AS revenue_usd
FROM "Invoices" i
JOIN "Locations" l ON l."Id" = i."LocationId"
WHERE l."Name" = 'Careflow Sample Clinic (Test Data)'
  AND i."Number" LIKE 'SAMPLE-HIST-%'
GROUP BY payment_month ORDER BY payment_month;

COMMIT;
