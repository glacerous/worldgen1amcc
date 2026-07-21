import sys
import os
from pathlib import Path

# Try importing psycopg2
try:
    import psycopg2
except ImportError:
    print("psycopg2 belum terinstall. Menginstall via pip...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
    import psycopg2

def main():
    """
    Script otomatis untuk menjalankan Migration 016 ke Supabase Postgres database.
    
    Cara pakai:
      python backend/run_migration_016.py <DB_PASSWORD>
      
    Atau:
      python backend/run_migration_016.py "postgresql://postgres.ytemrvfxqrpdmrslfeeq:YOUR_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
    """
    if len(sys.argv) < 2:
        print("\n=== SCRIPT MIGRATION AUTOMATION 016 ===")
        print("Supabase REST API/Service Key secara default memblokir DDL (ALTER TABLE) demi keamanan.\n")
        print("Untuk menjalankan migration secara otomatis lewat script terminal, jalankan:")
        print("  python backend/run_migration_016.py <PASSWORD_DATABASE_SUPABASE>\n")
        print("Atau masukkan URI koneksi lengkap:")
        print('  python backend/run_migration_016.py "postgresql://postgres.ytemrvfxqrpdmrslfeeq:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"\n')
        sys.exit(1)

    arg = sys.argv[1]
    if arg.startswith("postgres://") or arg.startswith("postgresql://"):
        conn_str = arg
    else:
        # standard pooler / direct connection format for Supabase
        conn_str = f"postgresql://postgres.ytemrvfxqrpdmrslfeeq:{arg}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

    migration_file = Path(__file__).resolve().parent / "migrations" / "016_audit_run_votes.sql"
    if not migration_file.exists():
        print(f"File migration tidak ditemukan di: {migration_file}")
        sys.exit(1)

    sql = migration_file.read_text(encoding="utf-8")

    print(f"Connecting to database...")
    try:
        conn = psycopg2.connect(conn_str, connect_timeout=10)
        conn.autocommit = True
        cur = conn.cursor()
        print("Executing Migration 016 SQL...")
        cur.execute(sql)
        print("\n✅ Migration 016 BERHASIL DIMALAKSANAKAN DI SUPABASE!")
        print("Tabel `votes` sekarang sudah memiliki kolom `audit_run_id` dan keunikan per audit run.\n")
        conn.close()
    except Exception as e:
        print("\n❌ Gagal koneksi/menjalankan migration:", e)
        print("Pastikan password database Supabase benar.")

if __name__ == "__main__":
    main()
