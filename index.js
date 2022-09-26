const apiUri = "https://api.coinbase.com/v2/prices/BTC-USD/buy";

var currentPrice = diffPrice = 0;
var currentIndex = offsetIndex = 0;
const intervalDuration = 180000;
let countDownDuration = intervalDuration;

// display debug info when pressing "i" key
$("#toggleBtn").click(function () {  
    const display = $("div.infoArea.debug").css("display");
    $("div.infoArea.debug").css("display", display == "none" ? "block" : "none");
    $("div.infoArea.pub").css("display", display == "none" ? "none" : "block");
});

// dsiplay the "check every" info
$("#checkEveryInfo").text(`${intervalDuration/1000} seconds`);

// display the BTC price
$("h1.price").text(`BTC: ${currentPrice} $`);

$.get(apiUri, function (data) {
  if (!navigator.onLine) { 
    $("h1.price").text("Internet Connection Problem");
    return;
  }
  if (!data) { 
    $("h1.price").text("API Issue");
    return;
  }

  currentPrice = parseFloat(data.data.amount);
  $("h1.price").text(`BTC: ${currentPrice} $`);
  $("#historyInfo tbody").prepend(`<tr>
      <td>${currentPrice}$</td>
      <td>${toJapaneseString(Date())}</td>
      <td style='color:blue'>🡒</td>
    </tr>`);
})

setInterval(function () {
  if (countDownDuration < 2000) {
    countDownDuration = intervalDuration;
  } else { 
    countDownDuration -= 1000;
  }
  $("#updateInInfo").text(`${countDownDuration / 1000} seconds`);
}, 1000);

setInterval(function() {
  $.get(apiUri, function (data) {
    let videoType = " 🡒 ";
    let videoColor = "blue";

    if (!navigator.onLine) { 
      $("h1.price").text("Internet Connection Problem");
      return;
    }

    if (!data) { 
      $("h1.price").text("API Issue");
      return;
    }
    // calculate the price gap between current and previous;
    diffPrice = parseFloat(data.data.amount) - currentPrice;
    // update the current price
    currentPrice = parseFloat(data.data.amount);

    $("h1.price").text(`BTC: ${currentPrice} $`);
    
    if (diffPrice < -10) { // when down 
      offsetIndex = 2 - currentIndex;
      currentIndex = 2;
      videoType = " 🡓 ";
      videoColor = "red";
    }
    else if (diffPrice > 10) { // when up
      offsetIndex = 1 - currentIndex;
      currentIndex = 1;
      videoType = " 🡑 ";
      videoColor = "green";
    }
    else { // when stable
      offsetIndex = 0 - currentIndex;
      currentIndex = 0;
      videoType = " 🡒 ";
      videoColor = "blue";
    } 

    $("#historyInfo tbody").prepend(`<tr><td>${currentPrice}$</td><td>${toJapaneseString(Date())}</td><td style='color: ${videoColor}'>${videoType}</td></tr>`);
    // $("#scrollPanel").scrollTop($("#scrollPanel")[0].scrollHeight);

    console.log(`Current Price: ${currentPrice}, Diff Price: ${diffPrice}`);
  })}, intervalDuration);

var VIDEO_SOURCES = [
  {
    type: 'video/mp4',
    src: './assets/btc-neutral.mp4'
  },
  {
    type: 'video/mp4',
    src: './assets/btc-up.mp4'
  },
  {
    type: 'video/mp4',
    src: './assets/btc-down.mp4'
  }
];

// create the videos from the source
const videos = [];
for (let i = 0; i < VIDEO_SOURCES.length; i++) { 
  videos.push(new ConfiguratorVideo([VIDEO_SOURCES[i]]));
}
// create the pixi app
const app = new PIXI.Application(1080, 1080, { backgroundColor: 0x1099bb });

// Draw it!
document.body.appendChild(app.view);

const promiseArray = [];
for (let i = 0; i < videos.length; i++) { 
  promiseArray.push(videos[i].load());
}

Promise.all(promiseArray).then(function() {
  let videoSprites = [], videoTextures = [];

  // Create the texture, this will be autoUpdating itself by default
  // based on the shared PixiJS ticker. We can opt out of that if needed.
  for (let i = 0; i < videos.length; i++) { 
    videoTextures.push(PIXI.Texture.from(videos[i].videoElement));
  }
  // It appears as though this doesn't work if the video being loaded is already ready to play
  // Boo for a crappy options interfaces (or lack thereof altogether)
  videoTextures.forEach(videoTexture => { 
    videoTexture.autoPlay = true;
    videoTexture.baseTexture.source.loop = true;
  });

  // Create a Sprite to draw on the stage
  for (let i = 0; i < videoTextures.length; i++) {
    const videoSprite = new PIXI.Sprite(videoTextures[i]);
    videoSprite.width = 1080;
    videoSprite.height = 1080;
    videoSprite.alpha = 0;
    app.stage.addChild(videoSprite);
    videoSprites.push(videoSprite);
  }

  videoSprites[currentIndex].alpha = 1;

  animate();

  function animate() { 
    if (offsetIndex) { // when change exists
      if (videoSprites[currentIndex].alpha < 1) {
        videoSprites[currentIndex - offsetIndex].alpha -= .02;
        videoSprites[currentIndex].alpha += .02;
      }
    }
    requestAnimationFrame(animate);
  }
});


