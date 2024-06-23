// Vanced Images LightBox FullScreen v1.0b
// 1.0a: Hỗ trợ cho Gallery
// V1.0b: Bỏ sung các thẻ Hình ảnh đơn từ LDP: Frame, Box, Image

// 1.0a: Bổ trọ cho Gallery
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

// 1.0b: Bổ trợ cho các thành phẩn lẻ
const Vx_LightBoxHolders_FrameBG = document.querySelectorAll(
  ".Vx_LightBoxHolder .ladi-frame .ladi-frame-background"
); // Chọn Frame, đã trỏ sẵn hình ảnh, trả về chuỗi dạng OBJ có sẵn att background-image kèm URL

const Vx_LightBoxHolders_BoxBG = document.querySelectorAll(
  ".Vx_LightBoxHolder .ladi-box"
); // Chọn Box, đã trỏ sẵn hình ảnh, trả về chuỗi dạng OBJ có sẵn att background-image kèm URL

const Vx_LightBoxHolders_ImgBG = document.querySelectorAll(
  ".Vx_LightBoxHolder .ladi-image .ladi-image-background"
); // Chọn Box, đã trỏ sẵn hình ảnh, trả về chuỗi dạng OBJ có sẵn att background-image kèm URL

// // Gộp tất cả các thành phần lẻ lại và thêm lightbox cùng lúc
var Vx_LightBoxHolders_AllStrayImg = document.querySelectorAll(
  ".Vx_LightBoxHolder .ladi-frame .ladi-frame-background, .Vx_LightBoxHolder .ladi-box, .Vx_LightBoxHolder .ladi-image .ladi-image-background"
);
console.log(Vx_LightBoxHolders_AllStrayImg);

Vx_LightBoxHolders_AllStrayImg.forEach((Vx_LightBoxHolders_StrayImg) => {
  // Vx_LightBoxHolders_StrayImg;

  let isTheLightBoxReady = false; // Dùng để xác thực "đã bấm vào Gallery LẦN ĐẦU hay CHƯA"

  // Bắt đầu tạo một DIV ảo để copy các ảnh vào trong đây TẠM THỜI
  let Vx_PseudoStrayIms = document.createElement("div");
  Vx_PseudoStrayIms.style = "display: none"; // Div ảo xuất hiện trong DOM nhưng không hiện thị
  Vx_LightBoxHolders_StrayImg.appendChild(Vx_PseudoStrayIms);
  // Khởi tạo xog Div ảo

  // Tạo trước một giá trị Null, sau này sẽ dùng làm Container cho LightBox (Object dạng Biến của JS ko phải DOM)
  let Vx_FullscreenGarelly = null;

  function Vx_FullscreenShowFunc() {
    // Vì web có sử dụng Lazyload > nếu khởi tạo ngay từ đầu có thể phát sinh lỗi
    // Lần đầu bấm vào Gallery mới khởi tạo LightBox

    // Lần đầu Gallery: khởi tạo LightBox
    if (isTheLightBoxReady == false) {
      //
      // Tạo thẻ ảnh ảo để copy dũ liệu
      let PseudoImages = document.createElement("img");
      PseudoImages.style = "display: none";
      let style =
        Vx_LightBoxHolders_StrayImg.currentStyle ||
        window.getComputedStyle(Vx_LightBoxHolders_StrayImg, false);
      PseudoImages.src = style.backgroundImage.slice(4, -1).replace(/"/g, "");
      Vx_LightBoxHolders_StrayImg.appendChild(PseudoImages);

      Vx_FullscreenGarelly = new Viewer(PseudoImages);
      Vx_FullscreenGarelly.view(0);
      isTheLightBoxReady = true;
    } else if (isTheLightBoxReady == true) {
      // Kể từ lần thứ 2: Sử dụng LightBox đã khởi tạo và chạy với Index của ảnh bấm phải (Bắt đầu từ 0)
      Vx_FullscreenGarelly.view(0);
      console.log("runned");
    }
  }

  // Bước cuối: Thêm Trigger cho các ảnh (Click)
  Vx_LightBoxHolders_StrayImg.addEventListener("click", Vx_FullscreenShowFunc);
});
