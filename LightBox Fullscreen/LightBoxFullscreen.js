// Vanced Images LightBox FullScreen v1.0a
var isTheLightBoxReady = false;
const Vx_LightBoxHolders = document.querySelectorAll(".Vx_LightBoxHolder");

<<<<<<< HEAD
for (
  let Holder_index = 0;
  Holder_index < Vx_LightBoxHolders.length;
  Holder_index++
) {
  let Vx_LightBoxIms = Vx_LightBoxHolders[Holder_index].querySelectorAll(
=======
for (let index = 0; index < Vx_LightBoxHolders.length; index++) {
  let Vx_LightBoxIms = Vx_LightBoxHolders[index].querySelectorAll(
>>>>>>> bc8596d00a3109bc02e67024e9fc016b972a58d3
    ".ladi-gallery-view-item"
  );

  let Vx_PseudoIms = document.createElement("div");
  Vx_PseudoIms.style = "display: none";
<<<<<<< HEAD
  Vx_LightBoxHolders[Holder_index].appendChild(Vx_PseudoIms);

  let Vx_FullscreenGarelly = null;
=======
  Vx_LightBoxHolders.appendChild(Vx_PseudoIms);

  var Vx_FullscreenGarelly = null;
>>>>>>> bc8596d00a3109bc02e67024e9fc016b972a58d3

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
}
