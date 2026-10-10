const cursorGlow = document.getElementById("cursorGlow");

if (cursorGlow) {
  let mouseX = 0;
  let mouseY = 0;
  let glowX = 0;
  let glowY = 0;
  let raf = null;

  const isTouch = window.matchMedia("(hover: none)").matches;

  if (!isTouch) {
    document.addEventListener("mousemove", e => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!raf) loop();
    });

    function loop() {
      glowX += (mouseX - glowX) * 0.15;
      glowY += (mouseY - glowY) * 0.15;
      cursorGlow.style.left = glowX + "px";
      cursorGlow.style.top = glowY + "px";

      if (Math.abs(mouseX - glowX) > 0.5 || Math.abs(mouseY - glowY) > 0.5) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = null;
      }
    }
  } else {
    cursorGlow.style.display = "none";
  }
}

const INTRO_DURATION = 3500;

function playIntro() {
  const intro = document.getElementById("intro");
  const body = document.body;
  const progressBar = document.getElementById("introProgress");

  if (!intro) return;

  if (progressBar) {
    progressBar.style.transition = `width ${INTRO_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    requestAnimationFrame(() => {
      progressBar.style.width = "100%";
    });
  }

  function finish() {
    intro.classList.add("intro-leaving");
    body.classList.remove("intro-active");
    setTimeout(() => {
      intro.remove();
    }, 900);
  }

  setTimeout(finish, INTRO_DURATION);
}

playIntro();