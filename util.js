class ConfiguratorVideo { 
  constructor(sources, options = {}) {
    this._onVideoSeeked = this._onVideoSeeked.bind(this);
    this.options = Object.assign({
      // Defined in play
      playTimeout: 10000,
      // Defined in seekToTime
      seekToTimeTimeout: 10000
    }, options);
    this.sources = sources;
    this.isLoaded = false;
    this.videoElement = this._createVideoElement(sources);
    this._setupVideoSeeking();
  }

  _setupVideoSeeking() {
    this._videoSeekingListeners = [];
    return this.videoElement.addEventListener('seeked', this._onVideoSeeked);
  }

  _teardownVideoSeeking() {
    return this.videoElement.removeEventListener('seeked', this._onVideoSeeked);
  }

  _createVideoElement(sources) {
    var i, len, source, sourceElement, videoElement;
    videoElement = document.createElement('video');
    // NOTE: We may only want to do things like playsinline on mobile, or just
    // on iOS Safari
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('preload', '');
    // This will allow us to properly export the canvas
    videoElement.setAttribute('crossorigin', 'anonymous');
    // Maybe we want to add this as an option in the future, but for now
    // we will explicitly mute any audio for the video if it exists
    videoElement.volume = 0;
    videoElement.muted = true;
    for (i = 0, len = sources.length; i < len; i++) {
      source = sources[i];
      sourceElement = document.createElement('source');
      sourceElement.src = source.src;
      sourceElement.type = source.type;
      videoElement.appendChild(sourceElement);
    }
    return videoElement;
  }

  load() {
    var executor;
    executor = (resolve, reject) => {
      // TODO: Should we try to get more data than the first loadedData? Probably. Firefox
      // doesn't seem to fetch much.
      this.videoElement.addEventListener('loadeddata', function() {
        return resolve(this);
      });
      this.videoElement.addEventListener('error', function() {
        return reject(this);
      });
      return this.videoElement.load();
    };
    return new Promise(executor);
  }

  /**
   * Destroy this video and cleanup any remnants of it.
   */
  destroy() {
    // TODO: Remove all event listeners. Potentially by cloning? https://stackoverflow.com/questions/9251837/how-to-remove-all-listeners-in-an-element
    if (this.videoElement.parentNode) {
      this.videoElement.parentNode.removeChild(this.videoElement);
    }
    return this._teardownVideoSeeking();
  }

  /**
   * Is this video fully buffered?
   * @return {Boolean} True if the video has been fully buffered.
   */
  isFullyBuffered() {
    // NOTE: This isn't used right now and I have a feeling it's incomplete
    return this.videoElement.buffered.start(0) === 0 && this.videoElement.buffered.end(videoElement.buffered.length - 1) === this.videoElement.duration;
  }

  /**
       * Play the video element, and return a promise that will resolve when the video begins playing
       * @method play
       * @return {Promise} Promise to resolve when the video begins playing
       */
   play() {
    return new Promise((resolve, reject) => {
      var onPlayTimeout, onPlaying, removePlayingListener, timeoutId, videoPlaying;
      // Remove the event listener when we have resolved the promise
      removePlayingListener = (eventListener) => {
        return this.videoElement.removeEventListener('playing', eventListener);
      };
      // Inside of onPlaying 'this' is the video element
      onPlaying = function(timeoutId) {
        resolve();
        removePlayingListener(onPlaying);
        return clearTimeout(timeoutId);
      };
      // On timeout we will reject the promise and clean up the listener
      onPlayTimeout = function() {
        console.error("Timed out playing video");
        reject();
        return removePlayingListener(onPlaying);
      };
      // Begin the timer for the timeout
      timeoutId = setTimeout(onPlayTimeout, this.options.playTimeout);
      this.videoElement.addEventListener('playing', onPlaying.bind(this.videoElement, timeoutId));
      videoPlaying = this.videoElement.play();
      // Modern browsers (except Edge) return a promise that is resolved a un/successful play
      if (videoPlaying) {
        // We're not using the then, because we resolve the promise in the 'playing' event listener
        // Using the catch allows us to reject faster than the timeout if there's an issue
        return videoPlaying.catch(function() {
          reject();
          // Remove this event listener now that we have rejected the promise
          removePlayingListener(onPlaying);
          return clearTimeout(timeoutId);
        });
      }
    });
  }

  /**
   * Stops the video element
   * @method stop
   */
  stop() {
    return this.videoElement.pause();
  }

  /**
   * Seek the videoElement to the given target time.
   * @param  {float} targetTime The target time to seek to
   * @return {Promise}          A Promise that will resolve when the seek has completed. The Promise
   *                            will be rejected (a) if the seek doesn't complete within options.seekToTimeTimeout number of milliseconds.
   *                            in which case it will have an argument of ConfiguratorVideo.SEEK_TO_TIME_RESULT.TIMEOUT or
   *                            (b) if a subsequent seekToTime call occurred before this seekToTime call resolved, in which case
   *                            it will have an argument of ConfiguratorVideo.SEEK_TO_TIME_RESULT.ABORTED_BY_SUBSEQUENT_SEEK.
   */
  seekToTime(targetTime, seekOptions = {}) {
    var onSeekExecutor, seekingToTime;
    seekOptions = _.defaults({}, seekOptions, {
      seekablePadding: 4
    });
    // We will reject and clean up any Promises from an in-progress seekToTime
    // call. NOTE: This will be true if the last call was resolved succesfully, but
    // every line other than setting the info to null will be a no-op.
    if (this._lastSeekToTimeListenerInfo) {
      this.removeVideoSeekListener(this._lastSeekToTimeListenerInfo.listenerId);
      clearTimeout(this._lastSeekToTimeListenerInfo.timeoutId);
      this._lastSeekToTimeListenerInfo.reject(ConfiguratorVideo.SEEK_TO_TIME_RESULT.ABORTED_BY_SUBSEQUENT_SEEK);
      this._lastSeekToTimeListenerInfo = null;
    }
    onSeekExecutor = (resolve, reject) => {
      var listenerId, listenerInfo, onSeek, onSeekTimeout, timeoutId;
      // On timeout we will reject the promise and clean up the listener
      onSeekTimeout = function(listenerInfo) {
        console.error(`Timed out seeking to ${listenerInfo.targetTime}`);
        this.removeVideoSeekListener(listenerInfo.listenerId);
        listenerInfo.reject(ConfiguratorVideo.SEEK_TO_TIME_RESULT.TIMEOUT);
        if (this._lastSeekToTimeListenerInfo.listenerId === listenerInfo.listenerId) {
          return this._lastSeekToTimeListenerInfo = null;
        }
      };
      // On successful seek, we will resolve the promise, clean up
      // the listener, and cancel the seek timeout callback
      onSeek = function(listenerInfo) {
        this.removeVideoSeekListener(listenerInfo.listenerId);
        clearTimeout(listenerInfo.timeoutId);
        listenerInfo.resolve(ConfiguratorVideo.SEEK_TO_TIME_RESULT.SUCCESS);
        if (this._lastSeekToTimeListenerInfo.listenerId === listenerInfo.listenerId) {
          return this._lastSeekToTimeListenerInfo = null;
        }
      };
      // Begin gathering information about the listener
      // to use in various callbacks
      listenerInfo = {resolve, reject, targetTime};
      // Begin the timer for the timeout
      timeoutId = setTimeout(onSeekTimeout.bind(this, listenerInfo), this.options.seekToTimeTimeout);
      listenerInfo.timeoutId = timeoutId;
      // Add a seek listener
      listenerId = this.addVideoSeekListener(targetTime, onSeek.bind(this, listenerInfo));
      listenerInfo.listenerId = listenerId;
      // Store the listener info so this listener can be canceled on a subsequent seekToTime call
      this._lastSeekToTimeListenerInfo = listenerInfo;
      // Finally, attempt to seek to the target time
      return this.videoElement.currentTime = targetTime;
    };
    seekingToTime = new Promise(onSeekExecutor);
    return seekingToTime;
  }

  getCurrentTime() {
    var ref;
    return (ref = this.videoElement) != null ? ref.currentTime : void 0;
  }

  /**
   * Adds a listener callback to be called when a given targetTime is seeked
   * to by the videoElement.
   * @param {Number}   targetTime The seek time at which to call the listener callback.
   * @param {Function} callback   The listener callback.
   * @return {Number} listenerId   The id of the listener. To be used with removeVideoSeekLisener.
   */
  addVideoSeekListener(targetTime, callback) {
    var listenerId;
    listenerId = _.uniqueId();
    this._videoSeekingListeners = this._videoSeekingListeners.concat([
      {
        targetTime,
        callback,
        id: listenerId
      }
    ]);
    return listenerId;
  }

  /**
   * Removes the video seek listener with the given listenerId.
   * @param  {Number} listenerId The id of the listener given by addVideoSeekListener.
   * @return {Boolean}           True if the listener was successfully removed
   */
  removeVideoSeekListener(listenerId) {
    var isSuccessfullyRemoved;
    isSuccessfullyRemoved = false;
    this._videoSeekingListeners = this._videoSeekingListeners.filter(function(listener) {
      if (listener.id === listenerId) {
        isSuccessfullyRemoved = true;
        return false;
      }
      return true;
    });
    return isSuccessfullyRemoved;
  }

  _roundSeekTime(time) {
    return Math.floor(time * 10000) / 10000;
  }

  _onVideoSeeked(event) {
    var listenersToExecute, seekedTime;
    // Don't continue if there aren't any active listeners
    if (!this._videoSeekingListeners.length) {
      return;
    }
    listenersToExecute = [];
    seekedTime = event.target.currentTime;
    // Call the callbacks of any matching listeners
    return this._videoSeekingListeners.forEach((listener) => {
      // Because there could be a precision difference in the target time vs. the
      // videoElement time, we'll round these to the nearest 10e-4.
      if (this._roundSeekTime(seekedTime) === this._roundSeekTime(listener.targetTime)) {
        return listener.callback();
      }
    });
  }
}

function createConfigurator() { 
  ConfiguratorVideo.SEEK_TO_TIME_RESULT = { 'SUCCESS': 'SUCCESS', 'TIMEOUT': 'TIMEOUT', 'ABORTED_BY_SUBSEQUENT_SEEK': 'ABORTED_BY_SUBSEQUENT_SEEK' };
  return ConfiguratorVideo;
}

function ChromaFilter() {
  var fragmentShader, uniforms, vertexShader;
  vertexShader = null;
  fragmentShader = ['varying vec2 vTextureCoord;', 'uniform float thresholdSensitivity;', 'uniform float smoothing;', 'uniform vec3 colorToReplace;', 'uniform sampler2D uSampler;', 'void main() {', 'vec4 textureColor = texture2D(uSampler, vTextureCoord);', 'float maskY = 0.2989 * colorToReplace.r + 0.5866 * colorToReplace.g + 0.1145 * colorToReplace.b;', 'float maskCr = 0.7132 * (colorToReplace.r - maskY);', 'float maskCb = 0.5647 * (colorToReplace.b - maskY);', 'float Y = 0.2989 * textureColor.r + 0.5866 * textureColor.g + 0.1145 * textureColor.b;', 'float Cr = 0.7132 * (textureColor.r - Y);', 'float Cb = 0.5647 * (textureColor.b - Y);', 'float blendValue = smoothstep(thresholdSensitivity, thresholdSensitivity + smoothing, distance(vec2(Cr, Cb), vec2(maskCr, maskCb)));', 'gl_FragColor = vec4(textureColor.rgb, textureColor.a * blendValue);', '}'].join('\n');
  uniforms = {};
  PIXI.Filter.call(this, vertexShader, fragmentShader);
  this.uniforms.thresholdSensitivity = 0.2;
  this.uniforms.smoothing = 0.1;
  this.uniforms.colorToReplace = [0 / 255, 167 / 255, 62 / 255];
};