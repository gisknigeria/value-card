alter type "AdminRole" add value if not exists 'ASSOCIATION_REP';

alter table "User"
  add column if not exists "associationName" text;
