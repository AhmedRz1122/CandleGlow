
const flame = document.querySelector('.flame');

function randomFlicker() {
    const scale = 1 + Math.random() * 0.2;
    flame.style.transform = `translateX(-50%) scaleY(${scale})`;
}

setInterval(randomFlicker, 100);