// Avenue
var isAvenueFullScreenReady = false;

const AvenuesHolder = document.querySelector("#Avenue .StickyPos");
const AvenuesImgs = document.querySelectorAll(
  "#Avenue .StickyPos .ladi-gallery-view-item"
);

const AvenuePseudo = document.createElement("div");
AvenuePseudo.style = "display: none";
AvenuesHolder.appendChild(AvenuePseudo);

var AvenueGallery = null;

const AvenueOnClickFunc = () => {
  //
  if (isAvenueFullScreenReady == false) {
    //

    for (let index = 0; index < AvenuesImgs.length; index++) {
      //
      let PseudoImages = document.createElement("img");
      PseudoImages.style = "display: none";
      let style =
        AvenuesImgs[index].currentStyle ||
        window.getComputedStyle(AvenuesImgs[index], false);
      PseudoImages.src = style.backgroundImage.slice(4, -1).replace(/"/g, "");
      AvenuePseudo.appendChild(PseudoImages);
    }
    AvenueGallery = new Viewer(AvenuePseudo);
    AvenueGallery.show();

    isAvenueFullScreenReady = true;
  } else if (isAvenueFullScreenReady == true) {
    AvenueGallery.show();
  }
};

for (let index = 0; index < AvenuesImgs.length; index++) {
  AvenuesImgs[index].addEventListener("click", AvenueOnClickFunc);
}
