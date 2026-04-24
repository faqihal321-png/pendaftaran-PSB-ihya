#!/bin/bash

# 1. Update kode ke GitHub (Railway akan otomatis update)
echo "🚀 Mengunggah perubahan ke GitHub..."
git add .
git commit -m "Update dari terminal untuk aplikasi iOS"
git push origin main

# 2. Buka Proyek di Xcode
# Ganti 'AdminPSB.xcodeproj' sesuai nama file proyek Xcode Anda
echo "📱 Membuka proyek di Xcode..."
open AdminPSB.xcodeproj

# 3. Jalankan Simulator (Opsional)
# Ini akan mencoba mem-build proyek ke simulator yang aktif
# xcodebuild -scheme AdminPSB -simulator -destination 'platform=iOS Simulator,name=iPhone 15' build
