import React, { Component } from "react"
import PropTypes from "prop-types"
import SplitPane from "react-split-pane"
import { observer, inject } from "mobx-react"

import mapBeats from "helpers/mapBeats"
import fitToContainer from "hocs/fitToContainer"
import NoteCoordTransform from "model/NoteCoordTransform"

import PianoNotes from "./PianoNotes/PianoNotes"
import PencilMouseHandler from "./PianoNotes/PencilMouseHandler"
import SelectionMouseHandler from "./PianoNotes/SelectionMouseHandler"

import PianoKeys from "./PianoKeys"
import PianoGrid from "./PianoGrid"
import PianoLines from "./PianoLines"
import PianoRuler from "./PianoRuler"
import PianoSelection from "./PianoSelection"
import PianoCursor from "./PianoCursor"
import ControlPane from "./ControlPane"

import { VerticalScrollBar, HorizontalScrollBar, BAR_WIDTH } from "components/inputs/ScrollBar"

import "./PianoRoll.css"

const SCROLL_KEY_SPEED = 4

function PianoRoll({
  dispatch,
  mouseHandler,
  theme,
  track,
  transform,
  onClickKey,
  beats,
  endTick,
  mouseMode,
  selection,
  containerWidth,
  containerHeight,
  alphaHeight,
  scrollLeft,
  scrollTop,
  setScrollLeft,
  setScrollTop,
  controlMode,
  notesCursor,
  cursorPosition,
  onMountAlpha
}) {
  const { keyWidth, rulerHeight } = theme

  const width = containerWidth
  const widthTick = Math.max(endTick, transform.getTicks(containerWidth))
  const startTick = scrollLeft / transform.pixelsPerTick
  const mappedBeats = mapBeats(beats, transform.pixelsPerTick, startTick, widthTick)
  const events = track.events

  const contentWidth = widthTick * transform.pixelsPerTick
  const contentHeight = transform.getMaxY()

  const cursorPositionX = transform.getX(cursorPosition)

  function clampScroll(maxOffset, scroll) {
    return Math.floor(Math.min(maxOffset, Math.max(0, scroll)))
  }

  scrollLeft = clampScroll(contentWidth - containerWidth, scrollLeft)
  scrollTop = clampScroll(contentHeight - alphaHeight, scrollTop)

  return <div className="PianoRoll">
    <SplitPane split="horizontal" defaultSize={180} primary="second">
      <div
        className="alpha"
        ref={onMountAlpha}
        onWheel={e => {
          e.preventDefault()
          const scrollLineHeight = transform.pixelsPerKey * SCROLL_KEY_SPEED
          const delta = scrollLineHeight * (e.deltaY > 0 ? 1 : -1)
          setScrollTop(scrollTop + delta)
        }}>
        <div className="alphaContent" style={{ top: -scrollTop }}>
          <PianoLines
            theme={theme}
            width={width}
            pixelsPerKey={transform.pixelsPerKey}
            numberOfKeys={transform.numberOfKeys} />
          <PianoGrid
            theme={theme}
            width={width}
            height={contentHeight}
            scrollLeft={scrollLeft}
            beats={mappedBeats} />
          <PianoNotes
            events={events}
            selectedEventIds={selection.noteIds}
            transform={transform}
            width={width}
            cursor={notesCursor}
            dispatch={dispatch}
            mouseMode={mouseMode}
            scrollLeft={scrollLeft}
            isDrumMode={track.isRhythmTrack}
            mouseHandler={mouseHandler} />
          <PianoSelection
            color={theme.themeColor}
            width={width}
            height={contentHeight}
            selectionBounds={selection.enabled ? selection.getBounds(transform) : null}
            scrollLeft={scrollLeft} />
          <PianoCursor
            width={width}
            height={contentHeight}
            position={cursorPositionX - scrollLeft} />
          <PianoKeys
            theme={theme}
            width={keyWidth}
            keyHeight={transform.pixelsPerKey}
            numberOfKeys={transform.numberOfKeys}
            onClickKey={onClickKey} />
        </div>
        <div className="alphaRuler">
          <PianoRuler
            width={width}
            theme={theme}
            height={rulerHeight}
            endTick={widthTick}
            beats={mappedBeats}
            onMouseDown={({ tick }) => dispatch("SET_PLAYER_POSITION", { tick })}
            scrollLeft={scrollLeft}
            pixelsPerTick={transform.pixelsPerTick} />
          <div className="PianoRollLeftSpace" />
        </div>
        <VerticalScrollBar
          scrollOffset={scrollTop}
          contentLength={contentHeight}
          onScroll={({ scroll }) => setScrollTop(scroll)}
        />
      </div>
      <div className="beta">
        <ControlPane
          mode={controlMode}
          theme={theme}
          beats={mappedBeats}
          events={events}
          dispatch={dispatch}
          transform={transform}
          scrollLeft={scrollLeft}
          paddingBottom={BAR_WIDTH}
        />
        <HorizontalScrollBar
          scrollOffset={scrollLeft}
          contentLength={contentWidth}
          onScroll={({ scroll }) => setScrollLeft(scroll)}
        />
      </div>
    </SplitPane>
  </div>
}

class stateful extends Component {
  constructor(props) {
    super(props)

    this.pencilMouseHandler = new PencilMouseHandler()
    this.selectionMouseHandler = new SelectionMouseHandler()
  }

  componentDidMount() {
    this.props.player.on("change-position", this.onTick)
  }

  componentWillUnmount() {
    this.props.player.off("change-position", this.onTick)
  }

  onTick = tick => {
    const { autoScroll, scrollLeft, containerWidth, setCursorPosition, setScrollLeft, theme, scaleX } = this.props
    const transform = createTransform(theme.keyHeight, scaleX)
    const x = transform.getX(tick)

    setCursorPosition(tick)

    // keep scroll position to cursor
    if (autoScroll) {
      const screenX = x - scrollLeft
      if (screenX > containerWidth * 0.7 || screenX < 0) {
        setScrollLeft(x)
      }
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    return true
  }

  render() {
    const { dispatch, selection, theme, scaleX } = this.props
    const transform = createTransform(theme.keyHeight, scaleX)

    this.pencilMouseHandler.dispatch = dispatch
    this.pencilMouseHandler.transform = transform
    this.selectionMouseHandler.dispatch = dispatch
    this.selectionMouseHandler.transform = transform
    this.selectionMouseHandler.selection = selection

    const mouseHandler = this.props.mouseMode === 0 ?
      this.pencilMouseHandler : this.selectionMouseHandler

    return <PianoRoll {...this.props} {...this.state}
      transform={transform}
      mouseHandler={mouseHandler}
      onMountAlpha={c => this.alpha = c}
      alphaHeight={this.alpha ? this.alpha.getBoundingClientRect().height : 0}
    />
  }
}

function createTransform(keyHeight, scaleX) {
  const pixelsPerTick = 0.1 * scaleX
  return new NoteCoordTransform(
    pixelsPerTick,
    keyHeight,
    127)
}

PianoRoll.propTypes = {
  player: PropTypes.object.isRequired,
  quantizer: PropTypes.object.isRequired,
  endTick: PropTypes.number.isRequired,
  scaleX: PropTypes.number.isRequired,
  scaleY: PropTypes.number.isRequired,
  autoScroll: PropTypes.bool.isRequired,
  onClickKey: PropTypes.func.isRequired,
  mouseMode: PropTypes.number.isRequired
}

PianoRoll.defaultProps = {
  endTick: 400,
  scaleX: 1,
  scaleY: 1,
  autoScroll: false
}

export default fitToContainer(inject(({ rootStore: {
  song: { selectedTrack: track, endOfSong: endTick, measureList: { beats } },
  pianoRollStore: s,
  rootViewStore: { theme },
  services: { player, quantizer },
  dispatch
} }) => ({
    track,
    endTick,
    beats,
    theme,
    scaleX: s.scaleX,
    scaleY: s.scaleY,
    autoScroll: s.autoScroll,
    selection: s.selection,
    scrollLeft: s.scrollLeft,
    setScrollLeft: v => s.scrollLeft = v,
    scrollTop: s.scrollTop,
    setScrollTop: v => s.scrollTop = v,
    controlMode: s.controlMode,
    setControlMode: v => s.controlMode = v,
    cursorPosition: s.cursorPosition,
    setCursorPosition: v => s.cursorPosition = v,
    notesCursor: s.notesCursor,
    setNotesCursor: v => s.notesCursor = v,
    mouseMode: s.mouseMode,
    quantizer,
    player,
    dispatch,
    onChangeTool: () => s.mouseMode = (s.mouseMode === 0 ? 1 : 0),
    onClickKey: (noteNumber) => { console.log(noteNumber) }
  }))(observer(stateful)), {
    width: "100%",
    height: "100%"
  })