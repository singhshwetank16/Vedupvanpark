-- ==============================================================================
-- Ved Upvan Park: PostgreSQL schema for Supabase Free / self-hosted PostgreSQL
-- Version 1.0 | Designed for backend & secure API access
-- Run as database owner in Supabase SQL Editor.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS vup;

-- 1. PARK SETTINGS
CREATE TABLE IF NOT EXISTS vup.park_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  park_name TEXT NOT NULL DEFAULT 'Ved Upvan Park',
  organization_name TEXT NOT NULL DEFAULT '(Nagar Palika Parishid)',
  address TEXT NOT NULL DEFAULT 'Etawah Road, Sirsaganj, Firozabad - 205151',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  printing_width_mm NUMERIC(5,2) NOT NULL DEFAULT 76.20,
  printable_width_mm NUMERIC(5,2) NOT NULL DEFAULT 72.00,
  qr_size_mm NUMERIC(5,2) NOT NULL DEFAULT 40.00,
  max_persons_per_ticket INTEGER NOT NULL DEFAULT 20 CHECK (max_persons_per_ticket BETWEEN 1 AND 500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO vup.park_settings(id) VALUES (1) ON CONFLICT(id) DO NOTHING;

-- 2. COUNTERS & GATES
CREATE TABLE IF NOT EXISTS vup.counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vup.gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. STAFF
CREATE TABLE IF NOT EXISTS vup.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','MANAGER','COUNTER','GATE')),
  counter_id UUID REFERENCES vup.counters(id),
  gate_id UUID REFERENCES vup.gates(id),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. PLANS (TICKET, MONTHLY, FAMILY)
CREATE TABLE IF NOT EXISTS vup.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('TICKET','MONTHLY','FAMILY')),
  -- Prices in integer paise: e.g. 2000 means INR 20.00, 30000 means INR 300.00
  price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 730),
  max_people INTEGER NOT NULL DEFAULT 1 CHECK (max_people BETWEEN 1 AND 500),
  max_visits_per_day INTEGER CHECK (max_visits_per_day IS NULL OR max_visits_per_day > 0),
  cooldown_minutes INTEGER NOT NULL DEFAULT 10 CHECK (cooldown_minutes >= 0),
  allow_same_day_reentry BOOLEAN NOT NULL DEFAULT false,
  named_members_required BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((plan_type = 'TICKET' AND duration_days IS NULL) OR (plan_type IN ('MONTHLY','FAMILY') AND duration_days IS NOT NULL))
);

-- 5. ORDERS & PAYMENTS
CREATE TABLE IF NOT EXISTS vup.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference TEXT NOT NULL UNIQUE,
  item_type TEXT NOT NULL CHECK (item_type IN ('TICKET','MONTHLY','FAMILY')),
  purchaser_name TEXT,
  purchaser_phone TEXT,
  persons_count INTEGER NOT NULL CHECK (persons_count BETWEEN 1 AND 500),
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','UPI','CARD','ONLINE','OTHER')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PAID','FAILED','REFUNDED')),
  counter_id UUID REFERENCES vup.counters(id),
  operator_id UUID REFERENCES vup.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vup.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES vup.orders(id),
  provider TEXT,
  gateway_reference TEXT UNIQUE,
  method TEXT NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED')),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. SINGLE-USE TICKETS
CREATE TABLE IF NOT EXISTS vup.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL UNIQUE REFERENCES vup.orders(id),
  plan_id UUID NOT NULL REFERENCES vup.plans(id),
  persons_count INTEGER NOT NULL CHECK (persons_count BETWEEN 1 AND 500),
  price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
  qr_token_sha256 CHAR(64) NOT NULL UNIQUE,
  qr_token_ciphertext TEXT NOT NULL,
  qr_token_nonce TEXT NOT NULL,
  qr_token_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','USED','CANCELLED','EXPIRED','REFUNDED')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES vup.staff(id),
  used_gate_id UUID REFERENCES vup.gates(id),
  reprint_count INTEGER NOT NULL DEFAULT 0 CHECK (reprint_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status <> 'USED') OR used_at IS NOT NULL)
);

-- 7. REUSABLE PASSES (MONTHLY & FAMILY)
CREATE TABLE IF NOT EXISTS vup.passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_number TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL UNIQUE REFERENCES vup.orders(id),
  plan_id UUID NOT NULL REFERENCES vup.plans(id),
  pass_type TEXT NOT NULL CHECK (pass_type IN ('MONTHLY','FAMILY')),
  holder_name TEXT NOT NULL,
  holder_phone TEXT,
  people_allowed INTEGER NOT NULL CHECK (people_allowed BETWEEN 1 AND 500),
  valid_from DATE NOT NULL,
  valid_through DATE NOT NULL,
  qr_token_sha256 CHAR(64) NOT NULL UNIQUE,
  qr_token_ciphertext TEXT NOT NULL,
  qr_token_nonce TEXT NOT NULL,
  qr_token_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CANCELLED','REFUNDED','EXPIRED')),
  reprint_count INTEGER NOT NULL DEFAULT 0 CHECK (reprint_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_through >= valid_from),
  CHECK ((pass_type = 'MONTHLY' AND people_allowed >= 1) OR (pass_type = 'FAMILY' AND people_allowed >= 2))
);

CREATE TABLE IF NOT EXISTS vup.pass_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id UUID NOT NULL REFERENCES vup.passes(id) ON DELETE RESTRICT,
  member_name TEXT NOT NULL,
  member_reference TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pass_id, member_reference)
);

-- 8. NUMBER SEQUENCES & NUMBER GENERATOR FUNCTION
CREATE TABLE IF NOT EXISTS vup.number_sequences (
  document_type TEXT NOT NULL CHECK (document_type IN ('TICKET','MONTHLY','FAMILY','ORDER')),
  business_date DATE NOT NULL,
  last_number BIGINT NOT NULL CHECK (last_number > 0),
  PRIMARY KEY(document_type, business_date)
);

CREATE OR REPLACE FUNCTION vup.next_document_number(p_type TEXT, p_business_date DATE DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::DATE)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_seq BIGINT; v_prefix TEXT;
BEGIN
  IF p_type NOT IN ('TICKET','MONTHLY','FAMILY','ORDER') THEN
    RAISE EXCEPTION 'Invalid document type';
  END IF;
  IF p_business_date IS NULL THEN RAISE EXCEPTION 'Business date required'; END IF;
  INSERT INTO vup.number_sequences(document_type, business_date, last_number)
  VALUES(p_type, p_business_date, 1)
  ON CONFLICT(document_type, business_date)
    DO UPDATE SET last_number = vup.number_sequences.last_number + 1
  RETURNING last_number INTO v_seq;
  v_prefix := CASE p_type WHEN 'TICKET' THEN 'T' WHEN 'MONTHLY' THEN 'M'
                           WHEN 'FAMILY' THEN 'F' ELSE 'O' END;
  RETURN 'VUP-' || v_prefix || '-' || to_char(p_business_date, 'YYYYMMDD') || '-' || lpad(v_seq::TEXT, 6, '0');
END $$;

-- 9. ENTRY GATE EVENTS (AUDIT & REAL-TIME ADMISSION LOGS)
CREATE TABLE IF NOT EXISTS vup.entry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  document_type TEXT NOT NULL CHECK (document_type IN ('TICKET','PASS')),
  ticket_id UUID REFERENCES vup.tickets(id),
  pass_id UUID REFERENCES vup.passes(id),
  gate_id UUID REFERENCES vup.gates(id),
  scanned_by UUID REFERENCES vup.staff(id),
  result TEXT NOT NULL CHECK (result IN ('SUCCESS','USED','INVALID','EXPIRED','CANCELLED','SUSPENDED','DAILY_LIMIT','COOLDOWN','UNPAID','REJECTED')),
  persons_admitted INTEGER NOT NULL DEFAULT 0 CHECK (persons_admitted >= 0),
  reason TEXT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((document_type = 'TICKET' AND ticket_id IS NOT NULL AND pass_id IS NULL)
      OR (document_type = 'PASS' AND pass_id IS NOT NULL AND ticket_id IS NULL)),
  CHECK ((result = 'SUCCESS' AND persons_admitted > 0)
      OR (result <> 'SUCCESS' AND persons_admitted = 0))
);

-- Defense in depth: impossible to log two successful entries for a single-use ticket.
CREATE UNIQUE INDEX IF NOT EXISTS entry_one_success_per_ticket
  ON vup.entry_events(ticket_id) WHERE ticket_id IS NOT NULL AND result='SUCCESS';
CREATE INDEX IF NOT EXISTS idx_entries_pass_time ON vup.entry_events(pass_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_gate_time ON vup.entry_events(gate_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_time ON vup.tickets(status, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_pass_validity ON vup.passes(status, valid_from, valid_through);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON vup.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON vup.orders(payment_status, created_at DESC);

-- 10. PRINTERS & JOBS
CREATE TABLE IF NOT EXISTS vup.printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  counter_id UUID REFERENCES vup.counters(id),
  transport TEXT NOT NULL CHECK (transport IN ('USB','BLUETOOTH','LAN','WIFI','OS_PRINT')),
  host_or_identifier TEXT,
  port INTEGER CHECK (port IS NULL OR port BETWEEN 1 AND 65535),
  paper_width_mm NUMERIC(5,2) NOT NULL DEFAULT 76.20,
  printable_width_mm NUMERIC(5,2) NOT NULL DEFAULT 72.00,
  qr_size_mm NUMERIC(5,2) NOT NULL DEFAULT 40.00,
  auto_cut BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vup.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id UUID REFERENCES vup.printers(id),
  ticket_id UUID REFERENCES vup.tickets(id),
  pass_id UUID REFERENCES vup.passes(id),
  requested_by UUID REFERENCES vup.staff(id),
  result TEXT NOT NULL CHECK (result IN ('QUEUED','STARTED','SUCCESS','FAILED')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CHECK ((ticket_id IS NOT NULL AND pass_id IS NULL) OR (ticket_id IS NULL AND pass_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS vup.idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key TEXT NOT NULL UNIQUE,
  actor_id UUID REFERENCES vup.staff(id),
  operation TEXT NOT NULL,
  resource_id UUID,
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vup.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES vup.staff(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- DEFAULT SEED DATA (INITIAL SETUP FOR VED UPVAN PARK)
-- ==============================================================================
-- Counters
INSERT INTO vup.counters (code, name, enabled)
VALUES ('CTR-01', 'Main Ticket Counter 1', true)
ON CONFLICT (code) DO NOTHING;

-- Gates
INSERT INTO vup.gates (code, name, enabled)
VALUES ('GATE-01', 'Main Entrance Gate', true)
ON CONFLICT (code) DO NOTHING;

-- Default Plans (Prices in integer paise: 2000 paise = ₹20.00, 30000 paise = ₹300.00, 60000 paise = ₹600.00)
INSERT INTO vup.plans (code, name, plan_type, price_paise, duration_days, max_people, max_visits_per_day, cooldown_minutes, allow_same_day_reentry, active)
VALUES 
  ('ENTRY-SINGLE', 'Single Entry Ticket', 'TICKET', 2000, NULL, 1, 1, 0, false, true),
  ('MONTHLY-WALK', 'Monthly Walker Pass', 'MONTHLY', 30000, 30, 1, 2, 60, true, true),
  ('FAMILY-SUB-30', 'Family Subscription Pass (5 Person)', 'FAMILY', 60000, 30, 5, 2, 60, true, true)
ON CONFLICT (code) DO NOTHING;

-- Default Counter Staff
INSERT INTO vup.staff (name, email, password_hash, role, counter_id)
SELECT 'Counter Operator', 'counter1@vedupvan.local', crypt('vup@123', gen_salt('bf')), 'COUNTER', id
SELECT 'Counter Operator', 'counter1@vedupvan.local', crypt('counter@123', gen_salt('bf')), 'COUNTER', id
FROM vup.counters WHERE code = 'CTR-01'
ON CONFLICT (email) DO NOTHING;
ON CONFLICT (email) DO UPDATE SET password_hash = crypt('counter@123', gen_salt('bf'));

-- Default Gatekeeper Staff
INSERT INTO vup.staff (name, email, password_hash, role, gate_id)
SELECT 'Gate Security', 'gate1@vedupvan.local', crypt('vup@123', gen_salt('bf')), 'GATE', id
SELECT 'Gate Security', 'gate1@vedupvan.local', crypt('gate@123', gen_salt('bf')), 'GATE', id
FROM vup.gates WHERE code = 'GATE-01'
ON CONFLICT (email) DO NOTHING;
ON CONFLICT (email) DO UPDATE SET password_hash = crypt('gate@123', gen_salt('bf'));

-- Default Super Admin Staff
INSERT INTO vup.staff (name, email, password_hash, role)
VALUES ('Park Administrator', 'admin@vedupvan.local', crypt('admin@123', gen_salt('bf')), 'SUPER_ADMIN')
ON CONFLICT (email) DO UPDATE SET password_hash = crypt('admin@123', gen_salt('bf'));

-- Staff Login Authentication Function
CREATE OR REPLACE FUNCTION vup.staff_login(p_email TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  SELECT s.id, s.name, s.email, s.role, s.counter_id, s.gate_id, s.enabled,
         COALESCE(c.name, 'Main Ticket Counter 1') AS counter_name,
         COALESCE(c.code, 'CTR-01') AS counter_code,
         COALESCE(g.name, 'Main Entrance Gate') AS gate_name,
         COALESCE(g.code, 'GATE-01') AS gate_code
  INTO v_staff
  FROM vup.staff s
  LEFT JOIN vup.counters c ON c.id = s.counter_id
  LEFT JOIN vup.gates g ON g.id = s.gate_id
  WHERE LOWER(s.email) = LOWER(TRIM(p_email))
    AND s.password_hash = crypt(p_password, s.password_hash)
    AND s.enabled = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid Email or Password.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'staff', jsonb_build_object(
      'id', v_staff.id,
      'name', v_staff.name,
      'email', v_staff.email,
      'role', v_staff.role,
      'counter_name', v_staff.counter_name,
      'counter_code', v_staff.counter_code,
      'gate_name', v_staff.gate_name,
      'gate_code', v_staff.gate_code
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION vup.staff_login(TEXT, TEXT) TO anon, authenticated, service_role;

-- Default 3-Inch Bluetooth Printer Record
INSERT INTO vup.printers (name, transport, paper_width_mm, printable_width_mm, qr_size_mm, auto_cut, enabled)
VALUES ('Thermal 3-Inch 80mm Printer', 'BLUETOOTH', 76.20, 72.00, 40.00, true, true)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- HIGH-PERFORMANCE RPC FUNCTIONS FOR SUPABASE CLIENT / REST API
-- ==============================================================================

-- 1. ATOMIC SCAN & ADMIT FUNCTION FOR GATEKEEPER
-- Locks ticket/pass row, checks status, updates used status, and logs entry event
CREATE OR REPLACE FUNCTION vup.admit_visitor(
  p_qr_token_hash CHAR(64),
  p_gate_code TEXT DEFAULT 'GATE-01',
  p_request_id UUID DEFAULT gen_random_uuid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gate_id UUID;
  v_ticket RECORD;
  v_pass RECORD;
  v_today_ist DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_now_ist TIMESTAMPTZ := now();
  v_last_entry RECORD;
BEGIN
  -- Resolve Gate
  SELECT id INTO v_gate_id FROM vup.gates WHERE code = p_gate_code AND enabled = true;
  IF v_gate_id IS NULL THEN
    SELECT id INTO v_gate_id FROM vup.gates LIMIT 1;
  END IF;

  -- 1. FIRST: Check Single-Entry Tickets (FOR UPDATE lock)
  SELECT t.*, p.name AS plan_name INTO v_ticket
  FROM vup.tickets t
  JOIN vup.plans p ON p.id = t.plan_id
  WHERE t.qr_token_sha256 = p_qr_token_hash
  FOR UPDATE OF t;

  IF FOUND THEN
    -- Check if already used
    IF v_ticket.status = 'USED' OR v_ticket.used_at IS NOT NULL THEN
      INSERT INTO vup.entry_events(request_id, document_type, ticket_id, gate_id, result, persons_admitted, reason, scanned_at)
      VALUES (p_request_id, 'TICKET', v_ticket.id, v_gate_id, 'USED', 0, 'Ticket is already used and expired', v_now_ist);

      RETURN jsonb_build_object(
        'success', false,
        'code', 'USED',
        'document_type', 'TICKET',
        'ticket_number', v_ticket.ticket_number,
        'message', 'TICKET ALREADY EXPIRED! First scanned at: ' || to_char(v_ticket.used_at AT TIME ZONE 'Asia/Kolkata', 'DD-Mon-YYYY HH:MI AM')
      );
    END IF;

    -- Check status
    IF v_ticket.status <> 'ACTIVE' THEN
      INSERT INTO vup.entry_events(request_id, document_type, ticket_id, gate_id, result, persons_admitted, reason, scanned_at)
      VALUES (p_request_id, 'TICKET', v_ticket.id, v_gate_id, v_ticket.status, 0, 'Ticket status is not active: ' || v_ticket.status, v_now_ist);

      RETURN jsonb_build_object(
        'success', false,
        'code', v_ticket.status,
        'document_type', 'TICKET',
        'ticket_number', v_ticket.ticket_number,
        'message', 'Ticket cannot be used: Status is ' || v_ticket.status
      );
    END IF;

    -- Check expires_at
    IF v_ticket.expires_at IS NOT NULL AND v_now_ist > v_ticket.expires_at THEN
      UPDATE vup.tickets SET status = 'EXPIRED' WHERE id = v_ticket.id;
      INSERT INTO vup.entry_events(request_id, document_type, ticket_id, gate_id, result, persons_admitted, reason, scanned_at)
      VALUES (p_request_id, 'TICKET', v_ticket.id, v_gate_id, 'EXPIRED', 0, 'Ticket validity period expired', v_now_ist);

      RETURN jsonb_build_object(
        'success', false,
        'code', 'EXPIRED',
        'document_type', 'TICKET',
        'ticket_number', v_ticket.ticket_number,
        'message', 'Ticket validity expired!'
      );
    END IF;

    -- SUCCESS: Burn ticket immediately (one-time entry)
    UPDATE vup.tickets 
    SET status = 'USED',
        used_at = v_now_ist,
        used_gate_id = v_gate_id
    WHERE id = v_ticket.id;

    INSERT INTO vup.entry_events(request_id, document_type, ticket_id, gate_id, result, persons_admitted, reason, scanned_at)
    VALUES (p_request_id, 'TICKET', v_ticket.id, v_gate_id, 'SUCCESS', v_ticket.persons_count, 'Entry verified and single ticket burned', v_now_ist);

    RETURN jsonb_build_object(
      'success', true,
      'code', 'SUCCESS',
      'document_type', 'TICKET',
      'ticket_number', v_ticket.ticket_number,
      'persons_admitted', v_ticket.persons_count,
      'message', 'TICKET VERIFIED & EXPIRED! Entry Granted for ' || v_ticket.persons_count || ' Person(s).'
    );
  END IF;

  -- 2. SECOND: Check Reusable Passes (Monthly & Family)
  SELECT p.*, pl.name AS plan_name, pl.cooldown_minutes, pl.max_visits_per_day INTO v_pass
  FROM vup.passes p
  JOIN vup.plans pl ON pl.id = p.plan_id
  WHERE p.qr_token_sha256 = p_qr_token_hash
  FOR UPDATE OF p;

  IF FOUND THEN
    -- Check pass status
    IF v_pass.status <> 'ACTIVE' THEN
      INSERT INTO vup.entry_events(request_id, document_type, pass_id, gate_id, result, persons_admitted, reason, scanned_at)
      VALUES (p_request_id, 'PASS', v_pass.id, v_gate_id, v_pass.status, 0, 'Pass status is ' || v_pass.status, v_now_ist);

      RETURN jsonb_build_object(
        'success', false,
        'code', v_pass.status,
        'document_type', 'PASS',
        'pass_number', v_pass.pass_number,
        'message', 'Pass is not active: ' || v_pass.status
      );
    END IF;

    -- Check validity date range (IST dates)
    IF v_today_ist < v_pass.valid_from OR v_today_ist > v_pass.valid_through THEN
      INSERT INTO vup.entry_events(request_id, document_type, pass_id, gate_id, result, persons_admitted, reason, scanned_at)
      VALUES (p_request_id, 'PASS', v_pass.id, v_gate_id, 'EXPIRED', 0, 'Pass date validity expired', v_now_ist);

      RETURN jsonb_build_object(
        'success', false,
        'code', 'EXPIRED',
        'document_type', 'PASS',
        'pass_number', v_pass.pass_number,
        'message', 'Pass validity expired on ' || to_char(v_pass.valid_through, 'DD-Mon-YYYY')
      );
    END IF;

    -- Check cooldown minutes (prevent double tap in 10-60 mins)
    SELECT * INTO v_last_entry
    FROM vup.entry_events
    WHERE pass_id = v_pass.id AND result = 'SUCCESS'
    ORDER BY scanned_at DESC
    LIMIT 1;

    IF FOUND AND v_pass.cooldown_minutes > 0 THEN
      IF (v_now_ist - v_last_entry.scanned_at) < (v_pass.cooldown_minutes || ' minutes')::INTERVAL THEN
        INSERT INTO vup.entry_events(request_id, document_type, pass_id, gate_id, result, persons_admitted, reason, scanned_at)
        VALUES (p_request_id, 'PASS', v_pass.id, v_gate_id, 'COOLDOWN', 0, 'Scan cooldown active', v_now_ist);

        RETURN jsonb_build_object(
          'success', false,
          'code', 'COOLDOWN',
          'document_type', 'PASS',
          'pass_number', v_pass.pass_number,
          'message', 'COOLDOWN ACTIVE! Last scanned ' || to_char(v_last_entry.scanned_at AT TIME ZONE 'Asia/Kolkata', 'HH:MI AM')
        );
      END IF;
    END IF;

    -- SUCCESS: Pass remains ACTIVE, entry is logged with persons_admitted
    INSERT INTO vup.entry_events(request_id, document_type, pass_id, gate_id, result, persons_admitted, reason, scanned_at)
    VALUES (p_request_id, 'PASS', v_pass.id, v_gate_id, 'SUCCESS', v_pass.people_allowed, 'Pass verified and admission recorded', v_now_ist);

    RETURN jsonb_build_object(
      'success', true,
      'code', 'SUCCESS',
      'document_type', 'PASS',
      'pass_number', v_pass.pass_number,
      'pass_type', v_pass.pass_type,
      'holder_name', v_pass.holder_name,
      'persons_admitted', v_pass.people_allowed,
      'valid_through', to_char(v_pass.valid_through, 'DD-Mon-YYYY'),
      'message', 'PASS VERIFIED! Welcome ' || v_pass.holder_name || ' (' || v_pass.people_allowed || ' persons allowed).'
    );
  END IF;

  -- 3. NOT FOUND
  INSERT INTO vup.entry_events(request_id, document_type, ticket_id, gate_id, result, persons_admitted, reason, scanned_at)
  VALUES (p_request_id, 'TICKET', NULL, v_gate_id, 'INVALID', 0, 'No ticket or pass matching QR hash', v_now_ist);

  RETURN jsonb_build_object(
    'success', false,
    'code', 'INVALID',
    'message', 'INVALID QR! Ticket/Pass not found in Ved Upvan database.'
  );
END;
$$;

-- Allow calling the RPC from authenticated/anon client
GRANT USAGE ON SCHEMA vup TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION vup.admit_visitor(CHAR(64), TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION vup.next_document_number(TEXT, DATE) TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA vup TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA vup TO anon, authenticated, service_role;


-- =========================================================================
-- MIGRATION: SUBSCRIPTION PASS PHOTO, BIOMETRICS & FAMILY MEMBERS
-- =========================================================================

-- 1. Passes table columns
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS marital_status TEXT DEFAULT 'UNMARRIED';
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS family_members_count INTEGER DEFAULT 1;
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS biometric_id TEXT;
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS members_json JSONB DEFAULT '[]'::jsonb;

-- 2. Pass members table columns
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS relation TEXT DEFAULT 'Self';
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS biometric_id TEXT;
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS biometric_template TEXT;

-- 3. Entry events table columns
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS entry_photo_url TEXT;
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS biometric_verified BOOLEAN DEFAULT false;
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS biometric_member_id TEXT;
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS biometric_member_name TEXT;

-- 4. Expose columns in public views
CREATE OR REPLACE VIEW public.passes AS SELECT * FROM vup.passes;
CREATE OR REPLACE VIEW public.entry_events AS SELECT * FROM vup.entry_events;
CREATE OR REPLACE VIEW public.pass_members AS SELECT * FROM vup.pass_members;
