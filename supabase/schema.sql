-- Gist progress sync.
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Safe to re-run: every statement is idempotent.
--
-- Only the service-role key reaches these tables, from Next.js route handlers
-- behind the app's password gate. RLS is enabled with no policies, so the
-- anon and authenticated keys can read nothing even if one ever leaked.

-- A book you have on your shelf. Gutenberg books store a reference and are
-- re-derived on each device; pasted text is carried along when it is small
-- enough to be worth it; PDFs stay on the machine that opened them.
create table if not exists gist_books (
  profile            text        not null,
  book_id            text        not null,
  title              text        not null,
  author             text,
  lang               text        not null,
  source             text        not null check (source in ('gutenberg', 'paste', 'pdf')),
  gutenberg_id       integer,
  max_chars          integer     not null default 320,
  segmenter_version  text,
  -- Present only for pasted text under the size cap; null otherwise.
  text_content       text,
  added_at           timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (profile, book_id)
);

-- Where you are. The anchor is a fingerprint of the passage itself, so the
-- position survives the segmenter renumbering every passage in the book.
create table if not exists gist_progress (
  profile            text        not null,
  book_id            text        not null,
  passage_index      integer     not null default 0,
  anchor             text,
  segmenter_version  text,
  updated_at         timestamptz not null default now(),
  primary key (profile, book_id)
);

-- Graded attempts, keyed by a hash of the passage they graded rather than by
-- its index, so re-segmentation cannot silently attach an attempt to the
-- wrong sentence.
create table if not exists gist_attempts (
  profile      text        not null,
  book_id      text        not null,
  text_hash    text        not null,
  user_text    text        not null,
  grade        jsonb       not null,
  hints_used   integer     not null default 0,
  at           timestamptz not null default now(),
  primary key (profile, book_id, text_hash)
);

create index if not exists gist_attempts_book on gist_attempts (profile, book_id);

-- Words worth keeping.
create table if not exists gist_vocab (
  profile        text        not null,
  key            text        not null,
  term           text        not null,
  english        text        not null,
  note           text,
  book_id        text,
  book_title     text,
  passage_index  integer,
  lang           text,
  seen           integer     not null default 1,
  at             timestamptz not null default now(),
  primary key (profile, key)
);

alter table gist_books    enable row level security;
alter table gist_progress enable row level security;
alter table gist_attempts enable row level security;
alter table gist_vocab    enable row level security;
