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
verb.wetDryMix = 36
let bus = AVAudioMixerNode()
engine.attach(bus)
let tone = AVAudioUnitEQ(numberOfBands: 1)
engine.attach(tone)
let highCut = tone.bands[0]
highCut.filterType = .lowPass
highCut.frequency = 2650
highCut.bypass = false
engine.connect(bus, to: tone, format: format)
engine.connect(tone, to: verb, format: format)
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
// Two soft desks change bows independently. A distant solo occasionally
// emerges above them, with time between phrases for the narration to breathe.
let nearDesk = try instrument(49, 0.43, -0.34)
let farDesk = try instrument(49, 0.32, 0.31)
let solo = try instrument(40, 0.27, 0.08)

enum Gesture {
    case attack(UInt8, UInt8)
    case expression(UInt8)
    case release(UInt8)
}
struct Event {
    let sample: Int
    let unit: AVAudioUnitSampler
    let gesture: Gesture
}
var events = [Event]()
func bow(_ unit: AVAudioUnitSampler, _ pitch: Int, at start: Double, for length: Double,
         velocity: UInt8, shimmer: Bool = false) {
    let end = min(start + length, duration - 0.7)
    guard end - start > 0.8 else { return }
    func cue(_ t: Double, _ gesture: Gesture) {
        events.append(Event(sample: Int(t * rate), unit: unit, gesture: gesture))
    }
    cue(start, .expression(1))
    cue(start, .attack(UInt8(pitch), velocity))
    let attack = min(2.1, (end - start) / 4)
    let release = min(2.8, (end - start) / 3)
    for t in stride(from: start + 0.08, to: end, by: 0.08) {
        let edge = min(1, (t - start) / attack, (end - t) / release)
        let envelope = edge * edge * (3 - 2 * edge)
        let bowNoise = shimmer ? 0.94 + 0.035 * sin(t * 21.3) + 0.018 * sin(t * 27.1) : 1
        cue(t, .expression(UInt8(max(1, 96 * envelope * bowNoise))))
    }
    cue(end, .release(UInt8(pitch)))
}

// Open fifths gradually pick up a second or a sixth. The changing upper
// pitches are staggered across the common tones, without a bass downbeat.
let lower = [62, 62, 64, 62, 60, 62, 65, 64, 62]
let upper = [69, 67, 69, 65, 67, 69, 72, 69, 67]
let holds = [18.7, 15.9, 21.3, 17.2, 20.1, 16.5, 19.8]
var t = 0.0
var section = 0
while t < duration {
    let length = holds[section % holds.count]
    let pitch = section % lower.count
    bow(nearDesk, lower[pitch], at: t + 0.4, for: length - 0.7, velocity: 31, shimmer: true)
    bow(farDesk, upper[pitch], at: t + 3.7, for: length - 0.4, velocity: 29, shimmer: true)
    if section % 3 == 0 {
        let phrase = [[76, 74], [72, 71], [77, 76], [74, 72]][(section / 3) % 4]
        bow(solo, phrase[0], at: t + 6.8, for: 5.2, velocity: 32)
        bow(solo, phrase[1], at: t + 12.1, for: 4.3, velocity: 29)
    }
    t += length
    section += 1
}
events.sort { $0.sample < $1.sample }
try engine.enableManualRenderingMode(.offline,format:format,maximumFrameCount:4096)
try engine.start()
let output=try AVAudioFile(forWriting:destination,settings:format.settings)
let buffer=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:4096)!
var position=0,index=0
let end=Int(duration*rate)
while position<end {
    while index<events.count && events[index].sample<=position {
        let e=events[index]
        switch e.gesture {
        case let .attack(note, velocity): e.unit.startNote(note, withVelocity: velocity, onChannel: 0)
        case let .expression(value): e.unit.sendController(11, withValue: value, onChannel: 0)
        case let .release(note): e.unit.stopNote(note, onChannel: 0)
        }
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
