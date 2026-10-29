import Foundation
import NIOCore
import NIOHTTP1
import NIOPosix

/// Bun's default request size limit, which the TS bridge runs under.
let maxRequestBytes = 128 * 1024 * 1024

public struct PortTaken: Error, CustomStringConvertible {
    public let port: Int
    public let reason: String
    public var description: String { "port \(port) is already in use on this machine (\(reason))" }
}

/// The bridge over HTTP/1.1 on loopback, both families, never the wildcard.
public final class BridgeServer: @unchecked Sendable {
    private let handler: BridgeHandler
    private let group = MultiThreadedEventLoopGroup(numberOfThreads: 2)
    private var channels: [Channel] = []
    private let lock = NSLock()

    public init(handler: BridgeHandler) { self.handler = handler }

    /// Bind 127.0.0.1 and ::1 on `port`. Throws `PortTaken` when 127.0.0.1
    /// cannot be had; a machine with IPv6 off has no ::1, and one family is enough.
    @discardableResult
    public func start(port: Int) throws -> [String] {
        stop()
        let handler = self.handler
        let bootstrap = ServerBootstrap(group: group)
            .serverChannelOption(ChannelOptions.backlog, value: 256)
            .serverChannelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
            .childChannelInitializer { channel in
                channel.pipeline.configureHTTPServerPipeline(withErrorHandling: true).flatMap {
                    channel.pipeline.addHandler(HTTPBridgeHandler(handler: handler))
                }
            }
            .childChannelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
        var bound: [String] = []
        var opened: [Channel] = []
        for host in bridgeHostnames {
            do {
                opened.append(try bootstrap.bind(host: host, port: port).wait())
                bound.append(host)
            } catch {
                if host == "127.0.0.1" {
                    for c in opened { _ = try? c.close().wait() }
                    throw PortTaken(port: port, reason: String(describing: error))
                }
            }
        }
        lock.lock(); channels = opened; lock.unlock()
        return bound
    }

    public var isListening: Bool {
        lock.lock(); defer { lock.unlock() }
        return channels.contains { $0.isActive }
    }

    public func stop() {
        lock.lock(); let open = channels; channels = []; lock.unlock()
        for c in open { _ = try? c.close().wait() }
    }
}

final class HTTPBridgeHandler: ChannelInboundHandler, @unchecked Sendable {
    typealias InboundIn = HTTPServerRequestPart
    typealias OutboundOut = HTTPServerResponsePart

    private let handler: BridgeHandler
    private var head: HTTPRequestHead?
    private var body = ByteBuffer()
    private var tooLarge = false

    init(handler: BridgeHandler) { self.handler = handler }

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        switch unwrapInboundIn(data) {
        case .head(let h):
            head = h
            body = context.channel.allocator.buffer(capacity: 0)
            tooLarge = false
        case .body(var chunk):
            if body.readableBytes + chunk.readableBytes > maxRequestBytes { tooLarge = true } else { body.writeBuffer(&chunk) }
        case .end:
            guard let head else { return }
            self.head = nil
            let keepAlive = head.isKeepAlive
            let channel = context.channel
            let loop = context.eventLoop
            if tooLarge {
                write(BridgeResponse(status: 413, headers: [], body: .bytes(Data())), channel: channel, loop: loop, context: context, keepAlive: false)
                return
            }
            var headers: [String: String] = [:]
            for (name, value) in head.headers where headers[name.lowercased()] == nil { headers[name.lowercased()] = value }
            let req = BridgeRequest(method: head.method.rawValue, uri: head.uri, headers: headers,
                                    body: Data(body.readableBytesView))
            let handler = self.handler
            let bound = NIOLoopBound((self, context), eventLoop: loop)
            Task {
                let res = await handler.handle(req)
                loop.execute {
                    let (me, ctx) = bound.value
                    me.write(res, channel: channel, loop: loop, context: ctx, keepAlive: keepAlive)
                }
            }
        }
    }

    private func responseHead(_ res: BridgeResponse, keepAlive: Bool, length: Int?) -> HTTPResponseHead {
        var h = HTTPHeaders()
        for (k, v) in res.headers { h.add(name: k, value: v) }
        if let length { h.add(name: "Content-Length", value: String(length)) }
        if !keepAlive { h.replaceOrAdd(name: "Connection", value: "close") }
        return HTTPResponseHead(version: .http1_1, status: HTTPResponseStatus(statusCode: res.status), headers: h)
    }

    /// Runs on the channel's event loop.
    private func write(_ res: BridgeResponse, channel: Channel, loop: EventLoop, context: ChannelHandlerContext, keepAlive: Bool) {
        guard channel.isActive else { return }
        switch res.body {
        case .bytes(let data):
            context.write(wrapOutboundOut(.head(responseHead(res, keepAlive: keepAlive, length: data.count))), promise: nil)
            if !data.isEmpty {
                context.write(wrapOutboundOut(.body(.byteBuffer(context.channel.allocator.buffer(bytes: data)))), promise: nil)
            }
            context.writeAndFlush(wrapOutboundOut(.end(nil))).whenComplete { _ in
                if !keepAlive { channel.close(promise: nil) }
            }
        case .stream(let chunks):
            // No length: the encoder frames the body as chunked.
            context.writeAndFlush(wrapOutboundOut(.head(responseHead(res, keepAlive: keepAlive, length: nil))), promise: nil)
            let bound = NIOLoopBound((self, context), eventLoop: loop)
            let task = Task {
                for await data in chunks {
                    let sent: EventLoopFuture<Void> = loop.flatSubmit {
                        guard channel.isActive else { return loop.makeFailedFuture(ChannelError.ioOnClosedChannel) }
                        let (me, ctx) = bound.value
                        return ctx.writeAndFlush(me.wrapOutboundOut(.body(.byteBuffer(channel.allocator.buffer(bytes: data)))))
                    }
                    do { try await sent.get() } catch { return }
                }
                loop.execute {
                    guard channel.isActive else { return }
                    let (me, ctx) = bound.value
                    ctx.writeAndFlush(me.wrapOutboundOut(.end(nil))).whenComplete { _ in
                        if !keepAlive { channel.close(promise: nil) }
                    }
                }
            }
            // The reader closing the page ends the stream, and the CLI with it.
            channel.closeFuture.whenComplete { _ in task.cancel() }
        }
    }
}
