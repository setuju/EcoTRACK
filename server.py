#!/usr/bin/env python3
"""
EcoTRACK Local Development Server
Jalankan dengan: python server.py
"""

import http.server
import socketserver
import os
import sys
import webbrowser
from pathlib import Path

# Konfigurasi
PORT = 8000
DIRECTORY = "."  # Direktori root proyek


class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler untuk menambahkan header CORS dan logging yang lebih baik."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Tambahkan header CORS agar tidak ada masalah saat development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):
        # Tampilkan log dengan warna (jika terminal mendukung)
        print(f"[{self.log_date_time_string()}] {args[0]}")


def main():
    # Pindah ke direktori script (agar server berjalan dari root proyek)
    script_dir = Path(__file__).parent.absolute()
    os.chdir(script_dir)

    # Cek apakah index.html ada
    if not Path("index.html").exists():
        print("❌ ERROR: index.html tidak ditemukan!")
        print("   Pastikan server.py berada di folder yang sama dengan index.html")
        sys.exit(1)

    # Setup server
    handler = MyHTTPRequestHandler

    try:
        with socketserver.TCPServer(("", PORT), handler) as httpd:
            url = f"http://localhost:{PORT}"
            print("=" * 60)
            print("🌱 EcoTRACK Local Server")
            print("=" * 60)
            print(f"✅ Server berjalan di: {url}")
            print(f"📁 Serving files dari: {script_dir}")
            print()
            print("Tekan Ctrl+C untuk menghentikan server")
            print("=" * 60)

            # Buka browser secara otomatis
            webbrowser.open(url)

            # Jalankan server
            httpd.serve_forever()

    except KeyboardInterrupt:
        print("\n\n🛑 Server dihentikan.")
        sys.exit(0)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"❌ ERROR: Port {PORT} sudah digunakan!")
            print(f"   Coba jalankan di port lain dengan mengubah nilai PORT di server.py")
        else:
            print(f"❌ ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
