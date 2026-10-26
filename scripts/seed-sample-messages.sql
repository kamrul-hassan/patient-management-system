-- Synthetic portal messages only. No message is delivered outside this database.
-- Insert-only and safe to rerun: existing messages and read states are preserved.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('careflow-sample-messages-v1', 0));

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
        RAISE EXCEPTION 'Expected the eight explicitly labeled sample patients. No messages were added.';
    END IF;
END $$;

WITH sample_patients AS (
    SELECT p."Id", row_number() OVER (ORDER BY p."Email") - 1 AS sample_index
    FROM "Patients" p
    JOIN "Locations" l ON l."Id" = p."LocationId"
    WHERE l."Name" = 'Careflow Sample Clinic (Test Data)'
      AND p."Name" LIKE '% (Sample)'
      AND p."Email" ~ '^careflow\.sample\.[a-z.]+@example\.com$'
), topics(sample_index, subject, patient_body, staff_body) AS (
    VALUES
    (0, 'Appointment preparation',
     'FICTIONAL TEST MESSAGE. Hello, what should I bring to my sample consultation? I would like to test the patient messaging screen.',
     'FICTIONAL STAFF REPLY. This is a demonstration response about preparing for a sample consultation. No real appointment instructions were sent.'),
    (1, 'Follow-up summary question',
     'FICTIONAL TEST MESSAGE. Where can I find the summary from my demonstration visit? This is sample data only.',
     'FICTIONAL STAFF REPLY. The sample medical record can be viewed in Visit summaries. This response is stored locally for testing only.'),
    (2, 'Sample invoice clarification',
     'FICTIONAL TEST MESSAGE. Could you explain the fictional consultation charge on my sample invoice? No real payment is involved.',
     'FICTIONAL STAFF REPLY. This is a demonstration invoice in the billing ledger. No card was charged or payment collected.'),
    (3, 'Virtual visit device check',
     'FICTIONAL TEST MESSAGE. Can I check my camera before the demonstration virtual appointment? This is a test conversation.',
     'FICTIONAL STAFF REPLY. The local camera preview is available under Telemedicine. No live patient call is connected in this example.'),
    (4, 'Reviewing the test consent form',
     'FICTIONAL TEST MESSAGE. I would like to review the sample consent terms before trying the acknowledgment feature.',
     'FICTIONAL STAFF REPLY. Open the clearly labeled TEST ONLY form under Consent forms. It authorizes no actual treatment and creates no legal agreement.'),
    (5, 'Clinic location confirmation',
     'FICTIONAL TEST MESSAGE. Is my sample visit assigned to the Careflow Sample Clinic? I am testing the location display.',
     'FICTIONAL STAFF REPLY. This sample visit belongs to the fictional test clinic. The address shown is sample data, not a real destination.'),
    (6, 'Request to reschedule a sample visit',
     'FICTIONAL TEST MESSAGE. Could we review another time for my demonstration appointment? Please use this conversation to test staff replies.',
     'FICTIONAL STAFF REPLY. This reply demonstrates the outbox view. No appointment was changed automatically; you can test scheduling separately.'),
    (7, 'Downloading the visit summary',
     'FICTIONAL TEST MESSAGE. I would like to try downloading the plain-text summary for my fictional consultation.',
     'FICTIONAL STAFF REPLY. Open the sample visit summary and choose Download summary. This conversation contains no real patient information.')
), sample_messages AS (
    SELECT p."Id" AS patient_id,
           '[CAREFLOW SAMPLE] ' || t.subject AS subject,
           t.patient_body AS body,
           'Inbound' AS direction,
           p.sample_index >= 4 AS is_read,
           now() - ((p.sample_index + 1) * interval '5 minutes') AS created_at
    FROM sample_patients p
    JOIN topics t ON t.sample_index = p.sample_index
    UNION ALL
    SELECT p."Id",
           'Re: [CAREFLOW SAMPLE] ' || t.subject,
           t.staff_body,
           'Outbound',
           true,
           now() - ((p.sample_index + 1) * interval '5 minutes') + interval '2 minutes'
    FROM sample_patients p
    JOIN topics t ON t.sample_index = p.sample_index
    WHERE p.sample_index >= 4
)
INSERT INTO "Messages" ("Id", "PatientId", "Subject", "Body", "Channel", "Direction", "IsRead", "CreatedAt")
SELECT gen_random_uuid(), s.patient_id, s.subject, s.body, 'Portal', s.direction, s.is_read, s.created_at
FROM sample_messages s
WHERE NOT EXISTS (
    SELECT 1 FROM "Messages" m
    WHERE m."PatientId" = s.patient_id
      AND m."Subject" = s.subject
      AND m."Direction" = s.direction
);

COMMIT;
