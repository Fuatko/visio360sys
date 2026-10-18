#!/bin/zsh
# Procure SQL testleri — BOŞ, yerel bir PostgreSQL'de çalıştırın (canlı Supabase'de ÇALIŞTIRMAYIN: test verisi ve rol oluşturur).
# Kullanım: PGHOST=... PGPORT=... PGUSER=postgres ./sql/procure/test/run.sh
# Her çalıştırmada "procure_test" veritabanını silip yeniden kurar, 01-05'i iki kez (tekrar çalıştırılabilirlik) ve iş akışı testlerini çalıştırır.
set -e
D=${0:A:h}; S=$D/..; DB=procure_test
psql -q -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f $D/00-supabase-stub.sql
for f in 01-altyapi 02-talep-onay-butce 03-tedarikci-rfq 04-siparis-kabul 05-fatura-degerlendirme 01-altyapi 02-talep-onay-butce 03-tedarikci-rfq 04-siparis-kabul 05-fatura-degerlendirme; do
  psql -q -v ON_ERROR_STOP=1 -d $DB -f $S/$f.sql >/dev/null 2>&1 || { echo "HATA: $f.sql"; psql -v ON_ERROR_STOP=1 -d $DB -f $S/$f.sql | tail -5; exit 1; }
  echo "ok  $f.sql"
done
psql -q -v ON_ERROR_STOP=1 -d $DB -f $D/test-1a.sql | grep -E "TAMAM|ERROR"
psql -q -v ON_ERROR_STOP=1 -d $DB -f $D/test-1b.sql 2>&1 | grep -E "OK |TAMAM|ERROR|DETAIL|CONTEXT"
psql -q -v ON_ERROR_STOP=1 -d $DB -f $D/test-1c.sql 2>&1 | grep -E "OK |TAMAM|ERROR|DETAIL|CONTEXT"
psql -q -v ON_ERROR_STOP=1 -d $DB -f $D/test-1d.sql 2>&1 | grep -E "OK |TAMAM|ERROR|DETAIL|CONTEXT"
