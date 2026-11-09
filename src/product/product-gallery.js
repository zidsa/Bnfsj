/** Product gallery lifecycle and accessible Slick controls. */

function imageUrl(image, size) {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (image.image)
    return (
      image.image[size] || image.image.full_size || image.image.medium || ""
    );
  return image[size] || image.full_size || image.medium || "";
}

// Pin the first Slick-capable jQuery: other scripts (Vitrin's Apple Pay
// checkout) may later replace window.jQuery with a copy that has no Slick.
export function slickJQuery(carousel, doc) {
  var jq = doc.defaultView?.jQuery;
  if (!carousel.__bnfsjJQuery && jq?.fn?.slick) carousel.__bnfsjJQuery = jq;
  return carousel.__bnfsjJQuery;
}

export function destroyGallery(root) {
  var carousel = root.querySelector("#product-images-slick");
  var jq = carousel && slickJQuery(carousel, root.ownerDocument);
  if (jq && jq(carousel).hasClass("slick-initialized"))
    jq(carousel).slick("unslick");
}

function arrow(doc, className, icon, label) {
  var button = doc.createElement("button");
  button.type = "button";
  button.className = className + " slick-arrow";
  button.setAttribute("aria-label", label);
  var span = doc.createElement("span");
  span.className = icon;
  span.setAttribute("aria-hidden", "true");
  button.appendChild(span);
  return button.outerHTML;
}

export function renderGallery(root, value, doc, fallback) {
  doc = doc || root.ownerDocument;
  var images = ((
    value && value.images && value.images.length
      ? value.images
      : fallback && fallback.images
  ) || []).filter(function (image) {
    return Boolean(imageUrl(image, "full_size"));
  });
  var carousel = root.querySelector("#product-images-slick");
  var thumbs = root.querySelector(".product-images-carousel-thumbs");
  var empty = root.querySelector(".product-images-empty");
  var frame = root.querySelector(".product-images-carousel");
  if (!carousel || !thumbs || !frame || !empty) return;
  var jq = slickJQuery(carousel, doc);
  if (jq && jq(carousel).hasClass("slick-initialized"))
    jq(carousel).slick("unslick");
  carousel.replaceChildren();
  thumbs.replaceChildren();
  images.forEach(function (image, index) {
    var full = imageUrl(image, "full_size");
    var medium = imageUrl(image, "medium") || full;
    var alt = (image && image.alt_text) || value.name || "";
    var slide = doc.createElement("div");
    slide.innerHTML =
      '<div class="box-1-1"><div class="content"><div class="image-link"></div></div></div>';
    var imageElement = doc.createElement("img");
    imageElement.src = full;
    imageElement.className = "carousel-img";
    imageElement.alt = alt;
    slide.querySelector(".image-link").appendChild(imageElement);
    carousel.appendChild(slide);
    var thumb = doc.createElement("div");
    thumb.className = "col-3";
    thumb.innerHTML =
      '<div class="box-1-1"><div class="content"><button type="button" class="d-flex align-items-center justify-content-center thumb-image-a"></button></div></div>';
    var thumbLink = thumb.querySelector(".thumb-image-a");
    thumbLink.dataset.index = String(index);
    var thumbImage = doc.createElement("img");
    thumbImage.src = medium;
    thumbImage.alt = alt;
    thumbImage.dataset.index = String(index);
    thumbLink.appendChild(thumbImage);
    thumbs.appendChild(thumb);
  });
  var hasImages = images.length > 0;
  frame.classList.toggle("d-none", !hasImages);
  empty.classList.toggle("d-none", hasImages);
  thumbs.classList.toggle("d-none-important", images.length <= 1);
  if (hasImages && jq) {
    var rtl = doc.documentElement.dir !== "ltr";
    var nextArrowClass = rtl
      ? "icon-keyboard_arrow_left"
      : "icon-keyboard_arrow_right";
    var prevArrowClass = rtl
      ? "icon-keyboard_arrow_right"
      : "icon-keyboard_arrow_left";
    jq(carousel).slick({
      infinite: false,
      autoplay: false,
      arrows: images.length > 1,
      dots: images.length > 1,
      rtl: rtl,
      nextArrow: arrow(
        doc,
        "slick-next",
        nextArrowClass,
        doc.body.dataset.bnfsjNext || "Next",
      ),
      prevArrow: arrow(
        doc,
        "slick-prev",
        prevArrowClass,
        doc.body.dataset.bnfsjPrevious || "Previous",
      ),
    });
  }
}
