# Farrukh Huseynov  - Chrome Eklentisi

YouTube'da hızlı büyüyen faceless ve AI odaklı kanalları tespit eden profesyonel niş analiz aracı.

---

## Kurulum

1. Bu ZIP dosyasını bir klasöre çıkartın.
2. Chrome'da `chrome://extensions/` adresine gidin.
3. Sağ üstten **"Geliştirici modu"**nu açın.
4. **"Paketlenmemiş öğe yükle"** butonuna tıklayın.
5. Çıkarttığınız klasörü seçin.
6. Eklenti yüklendi! Chrome araç çubuğundaki **YZ** ikonuna tıklayın.

---

## Kullanım

### 1. API Anahtarı Ayarlama
- [Google Cloud Console](https://console.cloud.google.com/) üzerinden YouTube Data API v3 etkinleştirin.
- API anahtarı oluşturun ve eklentideki "YouTube API Anahtarı" alanına yapıştırın.
- **"Kaydet"** butonuna tıklayın.

### 2. Filtreler
| Filtre | Açıklama |
|--------|----------|
| **Arama Konusu** | Aramak istediğiniz niş veya konu (örn: "AI tools", "faceless YouTube") |
| **Kanal Yaşı** | Son 30, 60 veya 90 gün içinde açılmış kanalları filtreler |
| **Abone Aralığı** | Min-Max abone sayısı aralığı |
| **Sonuç Sayısı** | API kotasını korumak için 10, 25 veya 50 sonuç |
| **Sadece Outlier** | Yalnızca outlier videoları göster |

### 3. Outlier Tespiti
Bir video, **abone sayısının %300'ünden fazla izlenme** aldıysa **⚡ OUTLIER** olarak işaretlenir.

Örnek: 1.000 aboneli kanal → 3.000+ izlenme alan video = OUTLIER

### 4. Büyüme Skoru
```
Büyüme Skoru = Toplam Kanal İzlenmesi / Kanal Yaşı (gün)
```
Günlük ortalama izlenme kazanımını gösterir. Yüksek skor = hızlı büyüyen kanal.

### 5. CSV İndir
Sonuçları Excel'de analiz etmek için **"CSV İndir"** butonunu kullanın.

---

## API Kota Optimizasyonu

| İşlem | Kota Maliyeti |
|-------|--------------|
| Search (50 sonuç) | 100 birim |
| Channels (50 kanal) | 1 birim |
| Videos (50 video) | 1 birim |
| **Toplam (50 sonuç)** | ~102 birim |

Günlük 10.000 birim ücretsiz kota ile yaklaşık **98 tarama** yapabilirsiniz.

---

## Özellikler

- **Side Panel**: Sekmeler arası geçişte kapanmaz, sağda sabit kalır
- **API Anahtarı Kaydetme**: Yerel depolamada güvenli saklama
- **Outlier Tespiti**: %300 eşik ile sıradışı başarıları tespit eder
- **Büyüme Skoru**: Kanal büyüme hızını sayısal olarak ölçer
- **Tablo Sıralama**: Tüm sütunlara göre sıralama
- **CSV Export**: UTF-8 BOM ile Excel uyumlu dışa aktarma
- **Karanlık Tema**: Göz yormayan profesyonel arayüz
- **Hata Yönetimi**: Kota, geçersiz anahtar ve ağ hatalarını açıklar

---

## Geliştirici

**Farrukh Huseynov** | YouTube Data API v3 | Chrome Extension MV3
