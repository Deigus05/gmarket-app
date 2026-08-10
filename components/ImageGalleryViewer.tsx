import { optimizedImageUrl } from '@/lib/imageOptimization';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  FlatList as GHFlatList,
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height: SCREEN_HEIGHT } = Dimensions.get('window');
const THUMB_SIZE = 58;

/** iOS: zoom nativo via ScrollView (fluido + não bloqueia o pager). */
function IOSZoomImage({
  uri,
  boxWidth,
  boxHeight,
  onZoomActiveChange,
}: {
  uri: string;
  boxWidth: number;
  boxHeight: number;
  onZoomActiveChange?: (active: boolean) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const lastZoomed = useRef(false);

  const reportZoom = (zoomScale: number) => {
    const active = zoomScale > 1.01;
    if (active === lastZoomed.current) return;
    lastZoomed.current = active;
    setZoomed(active);
    onZoomActiveChange?.(active);
  };

  return (
    <ScrollView
      style={{ width: boxWidth, height: boxHeight }}
      contentContainerStyle={{
        width: boxWidth,
        height: boxHeight,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      maximumZoomScale={4}
      minimumZoomScale={1}
      scrollEnabled={zoomed}
      centerContent
      bouncesZoom
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e) => {
        reportZoom(e.nativeEvent.zoomScale ?? 1);
      }}
      onScrollEndDrag={(e) => {
        reportZoom(e.nativeEvent.zoomScale ?? 1);
      }}
      onMomentumScrollEnd={(e) => {
        reportZoom(e.nativeEvent.zoomScale ?? 1);
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: boxWidth, height: boxHeight }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
    </ScrollView>
  );
}

/**
 * Android: pinça + duplo toque.
 * Pan só ativa com zoom — senão o gesto falha e o pager horizontal recebe o swipe.
 */
function AndroidZoomImage({
  uri,
  boxWidth,
  boxHeight,
  onZoomActiveChange,
  pagerGesture,
}: {
  uri: string;
  boxWidth: number;
  boxHeight: number;
  onZoomActiveChange?: (active: boolean) => void;
  pagerGesture?: ReturnType<typeof Gesture.Native>;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const startScale = useSharedValue(1);

  const notifyZoom = (active: boolean) => {
    onZoomActiveChange?.(active);
  };

  const clampTranslation = (nextScale: number, x: number, y: number) => {
    'worklet';
    const maxX = Math.max(0, ((nextScale - 1) * boxWidth) / 2);
    const maxY = Math.max(0, ((nextScale - 1) * boxHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const snapToScale = (nextScale: number) => {
    'worklet';
    const clamped = Math.min(4, Math.max(1, nextScale));
    const pan = clampTranslation(clamped, translateX.value, translateY.value);
    scale.value = withTiming(clamped, { duration: 160 });
    translateX.value = withTiming(pan.x, { duration: 160 });
    translateY.value = withTiming(pan.y, { duration: 160 });
    savedScale.value = clamped;
    savedX.value = pan.x;
    savedY.value = pan.y;
    runOnJS(notifyZoom)(clamped > 1.02);
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = savedScale.value;
    })
    .onUpdate((event) => {
      const next = Math.min(4, Math.max(1, startScale.value * event.scale));
      const focalX = event.focalX - boxWidth / 2;
      const focalY = event.focalY - boxHeight / 2;
      const ratio = next / startScale.value;
      const dx = (focalX - savedX.value) * (1 - ratio);
      const dy = (focalY - savedY.value) * (1 - ratio);
      const pan = clampTranslation(next, savedX.value + dx, savedY.value + dy);
      scale.value = next;
      translateX.value = pan.x;
      translateY.value = pan.y;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        snapToScale(1);
      } else {
        savedScale.value = scale.value;
        const pan = clampTranslation(scale.value, translateX.value, translateY.value);
        translateX.value = pan.x;
        translateY.value = pan.y;
        savedX.value = pan.x;
        savedY.value = pan.y;
        runOnJS(notifyZoom)(true);
      }
    });

  const panZoom = Gesture.Pan()
    .maxPointers(1)
    .manualActivation(true)
    .onTouchesMove((_, state) => {
      if (savedScale.value > 1.02) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate((event) => {
      const pan = clampTranslation(
        scale.value,
        savedX.value + event.translationX,
        savedY.value + event.translationY,
      );
      translateX.value = pan.x;
      translateY.value = pan.y;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .maxDistance(12)
    .onEnd((event) => {
      if (savedScale.value > 1.05) {
        snapToScale(1);
        return;
      }
      const target = 2.5;
      const fx = event.x - boxWidth / 2;
      const fy = event.y - boxHeight / 2;
      translateX.value = -fx * (target - 1);
      translateY.value = -fy * (target - 1);
      snapToScale(target);
    });

  if (pagerGesture) {
    pinch.simultaneousWithExternalGesture(pagerGesture);
    panZoom.simultaneousWithExternalGesture(pagerGesture);
    doubleTap.simultaneousWithExternalGesture(pagerGesture);
  }

  const composed = Gesture.Simultaneous(pinch, panZoom, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View
        collapsable={false}
        style={[
          { width: boxWidth, height: boxHeight, justifyContent: 'center', alignItems: 'center' },
          animatedStyle,
        ]}
      >
        <Image
          source={{ uri }}
          style={{ width: boxWidth, height: boxHeight }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

function ZoomableImage({
  pagerGesture,
  ...props
}: {
  uri: string;
  boxWidth: number;
  boxHeight: number;
  onZoomActiveChange?: (active: boolean) => void;
  pagerGesture?: ReturnType<typeof Gesture.Native>;
}) {
  if (Platform.OS === 'ios') {
    return <IOSZoomImage {...props} />;
  }
  return <AndroidZoomImage {...props} pagerGesture={pagerGesture} />;
}

type ImageGalleryViewerProps = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  brandLabel?: string;
};

export function ImageGalleryViewer({
  visible,
  images,
  initialIndex = 0,
  onClose,
  onIndexChange,
  brandLabel = 'GMarket',
}: ImageGalleryViewerProps) {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const sheetY = useSharedValue(SCREEN_HEIGHT);
  const zoomedSV = useSharedValue(false);
  const pagerRef = useRef<any>(null);
  const thumbListRef = useRef<FlatList<string>>(null);
  const pagerGesture = useMemo(() => Gesture.Native(), []);

  const scrollThumbTo = (index: number) => {
    if (images.length <= 1) return;
    try {
      thumbListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    } catch {
      // ignore until layout is ready
    }
  };

  const setZoomState = (active: boolean) => {
    setZoomed(active);
    zoomedSV.value = active;
  };

  const finishClose = () => {
    setZoomState(false);
    onClose();
    sheetY.value = SCREEN_HEIGHT;
  };

  const close = () => {
    zoomedSV.value = false;
    setZoomed(false);
    sheetY.value = withTiming(SCREEN_HEIGHT, { duration: 280 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  };

  const onDismissDrag = (translationY: number) => {
    if (zoomedSV.value) return;
    sheetY.value = Math.max(0, translationY);
  };

  const onDismissEnd = (translationY: number, velocityY: number) => {
    if (zoomedSV.value) {
      sheetY.value = withSpring(0, { damping: 22, stiffness: 240 });
      return;
    }
    if (translationY > 100 || velocityY > 850) {
      sheetY.value = withTiming(SCREEN_HEIGHT, { duration: 260 }, (finished) => {
        if (finished) runOnJS(finishClose)();
      });
    } else {
      sheetY.value = withSpring(0, { damping: 22, stiffness: 240 });
    }
  };

  const headerDismiss = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(14)
        .failOffsetX([-20, 20])
        .onUpdate((event) => {
          if (zoomedSV.value) return;
          runOnJS(onDismissDrag)(Math.max(0, event.translationY));
        })
        .onEnd((event) => {
          runOnJS(onDismissEnd)(event.translationY, event.velocityY);
        }),
    [],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_HEIGHT], [1, 0], Extrapolation.CLAMP),
  }));

  const goToIndex = (index: number, animate = true) => {
    const safeIndex = Math.max(0, Math.min(index, images.length - 1));
    setActiveIndex(safeIndex);
    setZoomState(false);
    pagerRef.current?.scrollToOffset({
      offset: safeIndex * width,
      animated: animate,
    });
    scrollThumbTo(safeIndex);
    onIndexChange?.(safeIndex);
  };

  useEffect(() => {
    if (!visible) return;
    const next = Math.max(0, Math.min(initialIndex, Math.max(images.length - 1, 0)));
    setActiveIndex(next);
    setZoomState(false);
    sheetY.value = SCREEN_HEIGHT;
    const timer = setTimeout(() => {
      pagerRef.current?.scrollToOffset({
        offset: next * width,
        animated: false,
      });
      scrollThumbTo(next);
      sheetY.value = withSpring(0, {
        damping: 24,
        stiffness: 210,
        mass: 0.9,
      });
    }, 16);
    return () => clearTimeout(timer);
    // Só anima na abertura — não reagir a mudanças de índice enquanto aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!images.length) return null;

  const slideH = SCREEN_HEIGHT - Math.max(insets.top, 10) - 130;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={close}
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root}>
          <Reanimated.View style={[styles.backdrop, backdropStyle]} />
          <Reanimated.View style={[styles.modal, sheetStyle]}>
            <StatusBar barStyle="light-content" />

            <GestureDetector gesture={headerDismiss}>
              <View style={[styles.topSafe, { paddingTop: Math.max(insets.top, 10) }]}>
                <View style={styles.brandPill}>
                  <Text style={styles.brandText}>{brandLabel}</Text>
                </View>
                <View style={styles.counterPill}>
                  <Text style={styles.counterText}>
                    {activeIndex + 1}/{images.length}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={close}
                  activeOpacity={0.85}
                  hitSlop={12}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </GestureDetector>

            <View style={styles.mainArea}>
              <GestureDetector gesture={pagerGesture}>
                <GHFlatList
                  ref={pagerRef}
                  data={images}
                  style={{ flex: 1 }}
                  horizontal
                  pagingEnabled
                  scrollEnabled={!zoomed}
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  keyExtractor={(image, index) => `gallery-${image}-${index}`}
                  getItemLayout={(_, index) => ({
                    length: width,
                    offset: width * index,
                    index,
                  })}
                  onMomentumScrollEnd={({ nativeEvent }) => {
                    const index = Math.round(nativeEvent.contentOffset.x / width);
                    setActiveIndex(index);
                    setZoomState(false);
                    scrollThumbTo(index);
                    onIndexChange?.(index);
                  }}
                  renderItem={({ item, index }) => (
                    <View style={[styles.slide, { height: slideH }]}>
                      <ZoomableImage
                        key={`${item}-${index}-${index === activeIndex ? 'focus' : 'idle'}`}
                        uri={optimizedImageUrl(item, 'detail')}
                        boxWidth={width}
                        boxHeight={slideH}
                        onZoomActiveChange={setZoomState}
                        pagerGesture={pagerGesture}
                      />
                    </View>
                  )}
                />
              </GestureDetector>
            </View>

            {images.length > 1 && (
              <View
                style={[
                  styles.thumbsWrap,
                  { paddingBottom: Math.max(insets.bottom, 16) },
                  zoomed && styles.thumbsHidden,
                ]}
                pointerEvents={zoomed ? 'none' : 'auto'}
              >
                <FlatList
                  ref={thumbListRef}
                  data={images}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(image, index) => `thumb-${image}-${index}`}
                  contentContainerStyle={styles.thumbsContent}
                  renderItem={({ item, index }) => {
                    const selected = index === activeIndex;
                    return (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => goToIndex(index)}
                        style={styles.thumbSlot}
                      >
                        <View
                          style={[
                            styles.thumb,
                            selected ? styles.thumbSelected : styles.thumbIdle,
                          ]}
                        >
                          <Image
                            source={{ uri: optimizedImageUrl(item, 'thumb') }}
                            style={styles.thumbImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            )}
          </Reanimated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  modal: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  topSafe: {
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
    minHeight: 48,
  },
  brandPill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  brandText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  counterPill: {
    position: 'absolute',
    left: 16,
    bottom: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slide: {
    width,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainArea: {
    flex: 1,
  },
  thumbsWrap: {
    paddingTop: 10,
  },
  thumbsHidden: {
    opacity: 0,
  },
  thumbsContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  thumbSlot: {
    width: THUMB_SIZE + 10,
    height: THUMB_SIZE + 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  thumbIdle: {
    opacity: 0.45,
    transform: [{ scale: 0.9 }],
  },
  thumbSelected: {
    opacity: 1,
    transform: [{ scale: 1.08 }],
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
});
