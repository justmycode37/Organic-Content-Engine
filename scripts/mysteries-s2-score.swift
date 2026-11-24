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
let piano = try instrument(0, 0.62, -0.18)
let strings = try instrument(49, 0.22, 0.20)
let harp = try instrument(46, 0.33, 0.29)

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
// Two-bar chord voicings; the fourth and eighth phrases leave room after the cadence.
let chords = [[47,54,59,62,66],[43,50,59,62,66],[50,57,61,64,66],[45,52,57,59,64],
              [47,54,59,62,69],[43,50,57,62,66],[40,47,55,59,62],[42,49,57,61,66]]
var t=0.0, bar=0
while t < duration-2.0 {
    let push = (t>352 && t<462) || t<32
    let beat = push ? 0.34 : 0.39
    let span = 6*beat
    let harmony = chords[(bar/2)%8]
    let gentle = bar % 4 == 3
    let end = duration-t < 9
    if bar % 2 == 0 {
        note(strings,harmony[0],t,span*1.83,end ? 30 : 44)
        note(strings,harmony[2],t+0.19,span*1.76,end ? 26 : 36)
    }
    let pattern = bar%2==0 ? [0,2,3,1,4,3] : [1,3,4,2,3,1]
    for step in 0..<6 {
        if (gentle && step>2) || (!push && step==1) || (end && step>1) {continue}
        let shift=step==0 ? 0.0 : 0.012*sin(Double(bar*7+step))
        let v=[56,40,44,51,42,36][step]-(end ? 9 : 0)
        note(piano,harmony[pattern[step]]+(step==0 ? 0 : 12),t+Double(step)*beat+shift,beat*(step==0 ? 3.4 : 1.9),v)
    }
    if bar%8==0 || bar%8==5 {
        note(harp,harmony[4]+12,t+beat*3.1,span*1.2,45)
        if !end {note(harp,harmony[3]+12,t+beat*4.8,span*0.85,38)}
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
