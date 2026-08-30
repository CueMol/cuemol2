/**
 * @file worker/server/services/anim/anim.service.ts
 * @description Animation services: the registry entry for the whole folder.
 *
 * The eighteen calls the Animation panel and the element inspector make are
 * split by what they are for -- the timeline, playback, editing the strip,
 * one element's detail, the target lists it offers, and that element's raw
 * property tab. Nothing here but the wiring.
 *
 * Playback also pushes progress at the renderer from the worker's frame loop
 * (see transport.ts), which is why `pumpAnimProgress` and its companions
 * leave through this file too.
 */

import { listTimeline, getMgrState } from './timeline';
import {
    play, pause, stop, goTime, setLoop, setStartCam,
} from './transport';
import {
    setElementTime, addElement, removeElement, moveElement,
} from './edit';
import { getAnimElementDetail, setAnimElementProp } from './detail';
import { getAnimTargetOptions } from './targets';
import {
    getAnimElementGenericProps,
    setAnimElementGenericProp,
    resetAnimElementGenericProps,
} from './genericProps';

export const services = {
    animListTimeline: listTimeline,
    animGetMgrState: getMgrState,
    animPlay: play,
    animPause: pause,
    animStop: stop,
    animGoTime: goTime,
    animSetLoop: setLoop,
    animSetStartCam: setStartCam,
    animSetElementTime: setElementTime,
    animAddElement: addElement,
    animRemoveElement: removeElement,
    animMoveElement: moveElement,
    getAnimElementDetail,
    setAnimElementProp,
    getAnimTargetOptions,
    getAnimElementGenericProps,
    setAnimElementGenericProp,
    resetAnimElementGenericProps,
};

// Driven by the worker's frame loop and view activation, not by a service
// call: playback advances on a native timer that fires no event of its own.
export {
    pumpAnimProgress,
    forgetAnimProgress,
    clearAnimProgressWatches,
    pauseInactivePlayback,
} from './transport';

// The renderer-side callers of these services import their shapes from here.
export type * from './types';
