import SwiftUI
import WebKit

// Komponen untuk menampilkan website
struct WebView: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> WKWebView {
        return WKWebView()
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {
        let request = URLRequest(url: url)
        uiView.load(request)
    }
}

struct ContentView: View {
    var body: some View {
        // Mengarahkan langsung ke halaman login admin Railway Anda
        WebView(url: URL(string: "https://pendaftaran-psb-ihya-production.up.railway.app/login")!)
            .edgesIgnoringSafeArea(.all) // Agar tampilan full screen
    }
}
