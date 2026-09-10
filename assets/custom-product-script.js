
  
  window.onscroll = function () {
    myFunction();
  };
  
  var btn = document.getElementById("floatBtn");
  var BuyNowForm = document.getElementById("buy-now-form-section");
  var btn2 = document.getElementById("floatBtn2");
  var sticky = btn.offsetTop;
  
  function myFunction() {
    var BuyNowFormVisible = isElementWithInViewport(BuyNowForm);
  
    // Check if the user has scrolled past the button's original position
    if (!BuyNowFormVisible) {
      console.log('BuyNowFormVisible false');
      btn2.classList.remove("hide-float");
    } else {
      console.log('BuyNowFormVisible true');
      btn2.classList.add("hide-float");
    }
  }
  
  // Helper function to check if the element is in the viewport
  function isElementWithInViewport(el) {
    if(!el)
      return false;

 
    var rect = el.getBoundingClientRect();
  var html = document.documentElement;
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    (rect.bottom - window.scrollY) <= (window.innerHeight || html.clientHeight) &&
    rect.right <= (window.innerWidth || html.clientWidth)
  );
    
  }

  
  // Add the same scroll functionality to the sticky button
  btn2.addEventListener("click", function () {
    scrollToOptionsSection();
  });
  
  function scrollToOptionsSection() {
    const optionsSection = document.querySelector(".size-box"); // Select the specific options div
    const headerElement = document.querySelector(".header");
    const navbarHeight = headerElement ? document.querySelector(".header").offsetHeight : 0; // Adjust for the navbar height if necessary
    window.scrollTo({
      top: optionsSection.offsetTop - navbarHeight,
      behavior: "smooth",
    });
  }
  
  // Helper Function: Check if an element is in the viewport
  function isElementInViewport(el) {
    if(!el)
      return false;

    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  

document.getElementById('product-quantity-floating').addEventListener('input', function(){
  console.log(document.getElementById('product-quantity-floating'));
  document.getElementById('product-quantity').value = document.getElementById('product-quantity-floating').value;
});


function increaseQuantity() {
  var elem = document.getElementById('product-quantity-floating');
  if(!elem)
    return;

  var value = elem.value;
  elem.value = parseInt(value) + 1;
  document.getElementById('product-quantity').value = document.getElementById('product-quantity-floating').value;
  console.log(document.getElementById('product-quantity').value);
}

function decreaseQuantity() {
  var elem = document.getElementById('product-quantity-floating');
  if(!elem)
    return;

  var value = parseInt(elem.value);
  if(value > 0){
    elem.value = value - 1;
    document.getElementById('product-quantity').value = document.getElementById('product-quantity-floating').value;
  }

  console.log(document.getElementById('product-quantity').value);
  
}


  
  