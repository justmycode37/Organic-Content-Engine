// Original chamber score for S2. Render using the macOS General MIDI instrument bank.
import AVFoundation
import Foundation

let destination = URL(fileURLWithPath: CommandLine.arguments[1])
let duration = Double(CommandLine.arguments[2])!
let rate = 44100.0
let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
let engine = AVAudioEngine()
let bank = URL(fileURLWithPath: "/System/Library/Components/CoreAudio.component/Contents/Resources/gs_instruments.dls")
let verb = AVAudioUnitReverb()
engine.attach(verb)
verb.loadFactoryPreset(.mediumHall)
verb.wetDryMix = 18
let bus = AVAudioMixerNode()
engine.attach(bus)
engine.connect(bus, to: verb, format: format)
engine.connect(verb, to: engine.mainMixerNode, format: format)

func instrument(_ patch: UInt8, _ gain: Float, _ pan: Float) throws -> AVAudioUnitSampler {
    let unit = AVAudioUnitSampler()
    engine.attach(unit)
    engine.connect(unit, to: bus, format: format)
    try unit.loadSoundBankInstrument(at: bank, program: patch, bankMSB: 121, bankLSB: 0)
    unit.volume = gain
    unit.pan = pan
    return unit
}
let firstViolin = try instrument(40, 0.62, -0.16)
let secondViolin = try instrument(40, 0.35, 0.22)
let cello = try instrument(42, 0.30, 0.04)

struct Event {
    let sample: Int
    let unit: AVAudioUnitSampler
    let note: UInt8
    let velocity: UInt8
}
var events = [Event]()
func note(_ unit:AVAudioUnitSampler, _ pitch:Int, _ time:Double, _ length:Double, _ velocity:Int) {
    guard time < duration-1 else {return}
    events.append(Event(sample:Int(time*rate),unit:unit,note:UInt8(pitch),velocity:UInt8(velocity)))
    events.append(Event(sample:Int(min(duration-0.6,time+length)*rate),unit:unit,note:UInt8(pitch),velocity:0))
}
// Each phrase spans four bars. The second violin enters on the answer.
let lead = [[71,69,66,62], [67,66,62,59], [69,66,64,62], [64,62,61,57],
            [66,69,71,74], [74,71,69,67], [67,64,62,59], [61,64,66,69]]
let bass = [47,43,50,45,47,43,40,42]
let answers = [62,59,62,57,62,59,55,57]
var t = 0.0, bar = 0
while t < duration-2.0 {
    let passage = (t > 405 && t < 462)
    let beat = passage ? 0.36 : 0.43
    let span = 6*beat
    let chord = (bar/2)%8
    let line = lead[chord]
    let closing = duration-t < 10
    let velocity = closing ? 36 : (passage ? 52 : 44)
    if bar%2 == 0 {
        note(cello,bass[chord],t+0.04,span*1.77,closing ? 28 : 38)
        note(firstViolin,line[0],t,3.9*beat,velocity)
        note(firstViolin,line[1],t+4*beat,1.93*beat,velocity-5)
        if bar%4 == 2 {
            note(secondViolin,answers[chord],t+0.15,span*1.5,velocity-8)
        }
    } else {
        note(firstViolin,line[2],t,beat*(bar%4 == 3 ? 3.6 : 2.9),velocity-2)
        if bar%4 == 1 {
            note(firstViolin,line[3],t+3*beat,2.7*beat,velocity-6)
            note(secondViolin,answers[chord]+7,t+3.1*beat,2.5*beat,velocity-11)
        } else if passage {
            note(secondViolin,answers[chord],t+4*beat,1.65*beat,velocity-9)
        }
    }
    t+=span;bar+=1
}
events.sort{$0.sample==$1.sample ? $0.velocity<$1.velocity : $0.sample<$1.sample}
try engine.enableManualRenderingMode(.offline,format:format,maximumFrameCount:4096)
try engine.start()
let output=try AVAudioFile(forWriting:destination,settings:format.settings)
let buffer=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:4096)!
var position=0,index=0
let end=Int(duration*rate)
while position<end {
    while index<events.count && events[index].sample<=position {
        let e=events[index]
        if e.velocity>0 {e.unit.startNote(e.note,withVelocity:e.velocity,onChannel:0)}
        else {e.unit.stopNote(e.note,onChannel:0)}
        index+=1
    }
    let next=index<events.count ? events[index].sample : end
    let frames=min(4096,end-position,max(1,next-position))
    let state=try engine.renderOffline(AVAudioFrameCount(frames),to:buffer)
    if state == .cannotDoInCurrentContext {continue}
    guard state == .success else {fatalError("Sampler rendering failed")}
    try output.write(from:buffer)
    position+=Int(buffer.frameLength)
}
engine.stop()
