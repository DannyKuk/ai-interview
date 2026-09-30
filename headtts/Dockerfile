# syntax=docker/dockerfile:1

FROM node:24-slim

# onnxruntime-node's install script would also fetch CUDA libraries on Linux x64
ENV NODE_ENV=production ONNXRUNTIME_NODE_INSTALL_CUDA=skip

WORKDIR /srv

# dependencies first: this layer stays cached until the lockfile changes
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci \
    # HeadTTS's postinstall makes an empty node_modules/@huggingface/transformers in
    # its own folder (fine in a clone, not as a dependency), and Node resolves that
    # instead of the real package. The lockfile has nothing else nested there
    && rm -rf node_modules/@met4citizen/headtts/node_modules

# the server runs from its package folder: it loads ./modules, ./dictionaries, ./voices
# and ./headtts-node.json by relative path
WORKDIR /srv/node_modules/@met4citizen/headtts

# bake the model into the image (~320 MB, fp32) so it works offline
COPY headtts-node.json bake-model.mjs ./
RUN node bake-model.mjs && mkdir voices

# the two voices, pinned to a commit + checksum. --chmod:
# ADD from a URL makes them readable by root only, the server runs as "node" (voices/
# is made above: a folder ADD creates would get 644 too, and can't be opened then)
ADD --chmod=644 --checksum=sha256:d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b \
    https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/resolve/dd4401a9add81ac692d20e240d22ec9dda82cc29/voices/af_heart.bin \
    voices/af_heart.bin
ADD --chmod=644 --checksum=sha256:1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1 \
    https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/resolve/dd4401a9add81ac692d20e240d22ec9dda82cc29/voices/am_michael.bin \
    voices/am_michael.bin

USER node
EXPOSE 8882

CMD ["node", "modules/headtts-node.mjs"]
