#!/bin/bash
# Creates the "umami" database used by the Umami analytics container.
# Mounted at /docker-entrypoint-initdb.d/ so it runs only on first postgres init.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE umami'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\gexec
EOSQL
