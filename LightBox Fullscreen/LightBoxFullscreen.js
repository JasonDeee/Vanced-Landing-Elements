// Vanced Images LightBox FullScreen v1.0a
// 1.0a: Hỗ trợ cho Gallery

const Vx_LightBoxHolders_Gallery = document.querySelectorAll(
  ".Vx_LightBoxHolder .ladi-gallery"
); // Chọn hết tất cả các phần tử là Gallery có áp dụng LightBox

if (Vx_LightBoxHolders_Gallery != null) {
  Vx_LightBoxHolders_Gallery.forEach((VxLighBoxEls_Gallery) => {
    // Mỗi ảnh trong từng phần tử Gallery sẽ được lựa chọn
    let Vx_LightBoxIms = VxLighBoxEls_Gallery.querySelectorAll(
      ".ladi-gallery-view-item"
    );

    let isTheLightBoxReady = false; // Dùng để xác thực "đã bấm vào Gallery LẦN ĐẦU hay CHƯA"

    // Bắt đầu tạo một DIV ảo để copy các ảnh vào trong đây TẠM THỜI
    let Vx_PseudoIms = document.createElement("div");
    Vx_PseudoIms.style = "display: none"; // Div ảo xuất hiện trong DOM nhưng không hiện thị
    VxLighBoxEls_Gallery.appendChild(Vx_PseudoIms);
    // Khởi tạo xog Div ảo

    // Tạo trước một giá trị Null, sau này sẽ dùng làm Container cho LightBox (Object dạng Biến của JS ko phải DOM)
    let Vx_FullscreenGarelly = null;

    function Vx_FullscreenShowFunc(Img_Index) {
      // Vì web có sử dụng Lazyload > nếu khởi tạo ngay từ đầu có thể phát sinh lỗi
      // Lần đầu bấm vào Gallery mới khởi tạo LightBox

      // Lần đầu Gallery: khởi tạo LightBox
      if (isTheLightBoxReady == false) {
        //
        for (let index = 0; index < Vx_LightBoxIms.length; index++) {
          //
          let PseudoImages = document.createElement("img");
          PseudoImages.style = "display: none";
          let style =
            Vx_LightBoxIms[index].currentStyle ||
            window.getComputedStyle(Vx_LightBoxIms[index], false);
          PseudoImages.src = style.backgroundImage
            .slice(4, -1)
            .replace(/"/g, "");
          Vx_PseudoIms.appendChild(PseudoImages);
        }
        Vx_FullscreenGarelly = new Viewer(Vx_PseudoIms);
        Vx_FullscreenGarelly.view(Img_Index);
        isTheLightBoxReady = true;
      } else if (isTheLightBoxReady == true) {
        // Kể từ lần thứ 2: Sử dụng LightBox đã khởi tạo và chạy với Index của ảnh bấm phải (Bắt đầu từ 0)
        Vx_FullscreenGarelly.view(Img_Index);
      }
    }

    // Bước cuối: Thêm Trigger cho các ảnh (Click)
    for (let Tindex = 0; Tindex < Vx_LightBoxIms.length; Tindex++) {
      Vx_LightBoxIms[Tindex].addEventListener("click", () => {
        Vx_FullscreenShowFunc(Tindex);
        console.log(Tindex);
      });
    }
  });
}
