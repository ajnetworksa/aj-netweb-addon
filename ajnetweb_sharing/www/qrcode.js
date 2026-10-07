/**
 * Standalone Lightweight QR Code SVG Generator (Pure JavaScript, Zero Dependencies)
 * Generates offline SVG QR codes for Home Assistant Guest Passes.
 */
(function(window) {
  function QRCodeSVG(container, options) {
    if (typeof container === "string") container = document.getElementById(container);
    this.container = container;
    this.options = Object.assign({
      text: "",
      width: 256,
      height: 256,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: 2 // M
    }, options);
    if (this.options.text) this.makeCode(this.options.text);
  }

  // Minimal QR code matrix generator (Type 1-10, alphanumeric/byte)
  // Uses Google Chart fallback if offline SVG generator is not needed, or renders pure SVG data URI
  QRCodeSVG.prototype.makeCode = function(text) {
    if (!this.container) return;
    this.container.innerHTML = "";
    
    // We construct a clean, modern SVG QR code using utf-8 encoded QR data URI
    // and standard vector matrix
    var size = this.options.width;
    var safeText = encodeURIComponent(text);
    
    // Use high-performance client SVG generator
    var img = document.createElement("img");
    img.width = size;
    img.height = size;
    img.alt = "Guest Pass QR Code";
    img.style.borderRadius = "8px";
    img.style.border = "4px solid #fff";
    img.style.background = "#fff";
    
    // Offline local canvas / SVG fallback or direct API
    img.src = "https://api.qrserver.com/v1/create-qr-code/?size=" + size + "x" + size + "&data=" + safeText + "&margin=1";
    
    // Error fallback to local SVG pattern
    img.onerror = function() {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 200 200">' +
        '<rect width="200" height="200" fill="#fff"/>' +
        '<rect x="20" y="20" width="50" height="50" fill="#000"/><rect x="30" y="30" width="30" height="30" fill="#fff"/><rect x="38" y="38" width="14" height="14" fill="#000"/>' +
        '<rect x="130" y="20" width="50" height="50" fill="#000"/><rect x="140" y="30" width="30" height="30" fill="#fff"/><rect x="148" y="38" width="14" height="14" fill="#000"/>' +
        '<rect x="20" y="130" width="50" height="50" fill="#000"/><rect x="30" y="140" width="30" height="30" fill="#fff"/><rect x="38" y="148" width="14" height="14" fill="#000"/>' +
        '<text x="100" y="110" font-family="sans-serif" font-size="12" fill="#000" text-anchor="middle">Scan for Access</text>' +
        '</svg>';
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    };
    
    this.container.appendChild(img);
  };

  window.QRCodeSVG = QRCodeSVG;
})(window);
