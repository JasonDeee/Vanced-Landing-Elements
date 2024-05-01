// Vanced Images LightBox FullScreen v1.0a
var isTheLightBoxReady = false;
const Vx_LightBoxHolders = document.querySelector(".Vx_LightBoxHolder");
const Vx_LightBoxIms = Vx_LightBoxHolders.querySelectorAll(
  ".ladi-gallery-view-item"
);

const Vx_PseudoIms = document.createElement("div");
Vx_PseudoIms.style = "display: none";
Vx_LightBoxHolders.appendChild(Vx_PseudoIms);

var Vx_FullscreenGarelly = null;

function Vx_FullscreenShowFunc(Img_Index) {
  if (isTheLightBoxReady == false) {
    //
    for (let index = 0; index < Vx_LightBoxIms.length; index++) {
      //
      let PseudoImages = document.createElement("img");
      PseudoImages.style = "display: none";
      let style =
        Vx_LightBoxIms[index].currentStyle ||
        window.getComputedStyle(Vx_LightBoxIms[index], false);
      PseudoImages.src = style.backgroundImage.slice(4, -1).replace(/"/g, "");
      Vx_PseudoIms.appendChild(PseudoImages);
    }
    Vx_FullscreenGarelly = new Viewer(Vx_PseudoIms);
    Vx_FullscreenGarelly.view(Img_Index);
    isTheLightBoxReady = true;
  } else if (isTheLightBoxReady == true) {
  }
  Vx_FullscreenGarelly.view(Img_Index);
}

for (let Tindex = 0; Tindex < Vx_LightBoxIms.length; Tindex++) {
  Vx_LightBoxIms[Tindex].addEventListener("click", () => {
    Vx_FullscreenShowFunc(Tindex);
    console.log(Tindex);
  });
}
