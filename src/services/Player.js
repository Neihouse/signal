import _ from "lodash"
import observable from "riot-observable"
import MIDIControlEvents from "../constants/MIDIControlEvents"
import MIDIChannelEvents from "../constants/MIDIChannelEvents"
import { eventToBytes } from "../helpers/midiHelper"
import { deassemble } from "../helpers/noteAssembler"
import assert from "assert"

const INTERVAL = 1 / 15 * 1000 // seconds

function firstByte(eventType, channel) {
  return (MIDIChannelEvents[eventType] << 4) + channel
}

function getEventsToPlay(song, startTick, endTick) {
  return _.chain(song.tracks)
    .map(t => t.getEvents())
    .flatten()
    .map(deassemble)
    .flatten()
    .filter(e => e && e.tick >= startTick && e.tick <= endTick)
    .value()
}

// 同じ名前のタスクを描画タイマーごとに一度だけ実行する
class DisplayTask {
  constructor() {
    this.tasks = {}
    setInterval(() => this.perform(), 50)
  }

  add(name, func) {
    this.tasks[name] = func
  }

  perform() {
    _.values(this.tasks).forEach(t => t())
    this.tasks = {}
  }
}

const displayTask = new DisplayTask()

export default class Player {
  _playing = false
  _currentTempo = 120
  _currentTick = 0
  _prevTime = 0
  _channelMutes = {}

  constructor(timebase, output) {
    this._output = output
    this._timebase = timebase

    observable(this)
  }

  set song(song) {
    this._song = song
  }

  play() {
    assert(this._song, "you must set song before play")
    this._playing = true
    clearInterval(this._intervalID)
    this._intervalID = setInterval(this._onTimer.bind(this), INTERVAL)
    this._prevTime = window.performance.now()
  }

  set position(tick) {
    this._currentTick = Math.max(0, tick)
    this.emitChangePosition()
    this.allSoundsOff()
  }

  get position() {
    return this._currentTick
  }

  get isPlaying() {
    return this._playing
  }

  get timebase() {
    return this._timebase
  }

  allSoundsOff() {
    for (const ch of _.range(0, 0xf)) {
      this._sendMessage([0xb0 + ch, MIDIControlEvents.ALL_SOUNDS_OFF, 0], window.performance.now())
    }
  }

  stop() {
    clearInterval(this._intervalID)
    this._playing = false
    this.allSoundsOff()
  }

  reset() {
    const time = window.performance.now()
    for (const ch of _.range(0, 0xf)) {
      // reset controllers
      this._sendMessage([firstByte("controller", ch), MIDIControlEvents.RESET_CONTROLLERS, 0x7f], time)
    }
    this.stop()
    this.position = 0
  }

  get currentTempo() {
    return this._currentTempo
  }

  muteChannel(channel, mute) {
    this._channelMutes[channel] = mute
    this.trigger("change-mute", channel)
  }

  isChannelMuted(channel) {
    return this._channelMutes[channel]
  }

  _sendMessage(msg, timestamp) {
    this._output.send(msg, Math.round(timestamp))
  }

  playNote({channel, noteNumber, velocity, duration}) {
    const timestamp = window.performance.now()
    this._sendMessage([firstByte("noteOn", channel), noteNumber, velocity], timestamp)
    this._sendMessage([firstByte("noteOff", channel), noteNumber, 0], timestamp + this.tickToMillisec(duration))
  }

  secToTick(sec) {
    // timebase: 1/4拍子ごとのtick数
    return sec *  this._currentTempo / 60 * this._timebase
  }

  tickToMillisec(tick) {
    return tick / (this._timebase / 60) / this._currentTempo * 1000
  }

  _onTimer() {
    const timestamp = window.performance.now()
    const deltaTime = timestamp - this._prevTime
    const deltaTick = this.secToTick(deltaTime / 1000)
    const endTick = this._currentTick + deltaTick

    const events = getEventsToPlay(this._song, this._currentTick, endTick)

    // channel イベントを MIDI Output に送信
    events
      .filter(e => e.type === "channel" && !this._channelMutes[e.channel])
      .forEach(e => {
        const bytes = eventToBytes(e, false)
        const waitTick = e.tick - this._currentTick
        this._sendMessage(bytes, timestamp + this.tickToMillisec(waitTick))
      })

    // channel イベント以外を実行
    events
      .filter(e => e.type !== "channel")
      .forEach(e => {
        switch (e.subtype) {
          case "setTempo":
            this._currentTempo = 60000000 / e.microsecondsPerBeat
            this.trigger("change-tempo", this._currentTempo)
            break
          case "endOfTrack":
            break
          default:
            break
        }
      })

    if (this._currentTick >= this._song.endOfSong) {
      this.stop()
    }

    this._prevTime = timestamp
    this._currentTick = endTick
    this.emitChangePosition()
  }

  emitChangePosition() {
    displayTask.add("changePosition", () => {
      this.trigger("change-position", this._currentTick)
    })
  }
}
