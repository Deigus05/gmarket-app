import React, { forwardRef, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

function paddingBottomOf(style: ScrollViewProps['contentContainerStyle']): number {
  const flat = StyleSheet.flatten(style);
  if (!flat) return 0;
  const value = flat.paddingBottom ?? (typeof flat.padding === 'number' ? flat.padding : 0);
  return typeof value === 'number' ? value : 0;
}

function liftFocusedInput(
  scrollRef: React.RefObject<ScrollView | null>,
  scrollY: number,
  keyboardHeight: number,
) {
  const input = TextInput.State.currentlyFocusedInput();
  if (!input || !scrollRef.current) return;

  input.measureInWindow((_x, y, _w, height) => {
    if (typeof y !== 'number' || typeof height !== 'number') return;
    const keyboardTop = Dimensions.get('window').height - keyboardHeight;
    const overflow = y + height + 24 - keyboardTop;
    if (overflow > 0) {
      scrollRef.current?.scrollTo({
        y: Math.max(0, scrollY + overflow),
        animated: true,
      });
    }
  });
}

/** ScrollView de formulário: o campo focado sobe e fica visível acima do teclado. */
export const KeyboardFormScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function KeyboardFormScrollView(
    {
      style,
      contentContainerStyle,
      onScroll,
      children,
      keyboardShouldPersistTaps,
      keyboardDismissMode,
      ...rest
    },
    ref,
  ) {
    const innerRef = useRef<ScrollView>(null);
    const scrollY = useRef(0);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    const assignRef = (node: ScrollView | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };

    useEffect(() => {
      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
      const show = Keyboard.addListener(showEvent, (event) => {
        const height = event.endCoordinates.height;
        setKeyboardHeight(height);
        setTimeout(
          () => liftFocusedInput(innerRef, scrollY.current, height),
          Platform.OS === 'ios' ? 80 : 32,
        );
      });
      const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
      return () => {
        show.remove();
        hide.remove();
      };
    }, []);

    return (
      <ScrollView
        ref={assignRef}
        style={[{ flex: 1 }, style]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
        keyboardDismissMode={keyboardDismissMode ?? (Platform.OS === 'ios' ? 'interactive' : 'on-drag')}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          contentContainerStyle,
          keyboardHeight > 0
            ? { paddingBottom: paddingBottomOf(contentContainerStyle) + keyboardHeight }
            : null,
        ]}
        {...rest}
      >
        {children}
      </ScrollView>
    );
  },
);
